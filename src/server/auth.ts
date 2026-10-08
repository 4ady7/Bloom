import { z } from "zod";
import { isValidTimeZone } from "@/domain/time";
import type { PublicUser } from "@/domain/types";
import { hashPassword, newId, newSessionToken, sha256, verifyPasswordOrDummy } from "./crypto";
import { one, run, transaction } from "./db";
import { AppError, isUniqueViolation } from "./errors";
import { assertNotLimited, recordHit } from "./rate-limit";

const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_MS = 14 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 5 * 60 * 1000;
const SIGNIN_WINDOW = 15 * 60 * 1000;
const SIGNUP_WINDOW = 60 * 60 * 1000;

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "name")
  .max(40, "name")
  .refine((value) => !/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(value), "name");

function hasClientAddress(ip: string): boolean {
  return ip !== "" && ip !== "local" && ip !== "unknown";
}

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(10).max(200);

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  timezone: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface SessionResult {
  token: string;
  user: PublicUser;
  maxAgeSeconds: number;
}

function publicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
  };
}

function requireTimezone(timezone: string): string {
  if (!isValidTimeZone(timezone)) {
    throw new AppError("INVALID_INPUT", "Choose a valid timezone.", 400, {
      timezone: "Choose a valid timezone.",
    });
  }
  return timezone;
}

export function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  timezone: string;
  userAgent?: string | null;
  ip?: string;
  now?: number;
}): SessionResult {
  const now = input.now ?? Date.now();
  const ip = input.ip ?? "local";
  const parsed = z
    .object({
      email: emailSchema.transform((value) => value.toLowerCase()),
      password: passwordSchema,
      displayName: displayNameSchema,
      timezone: z.string().min(1),
    })
    .safeParse({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      timezone: input.timezone,
    });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (key === "email") fields.email = "Enter a valid email.";
      else if (key === "password") fields.password = "Use at least 10 characters.";
      else if (key === "displayName") fields.displayName = "Use a name up to 40 characters.";
      else if (key === "timezone") fields.timezone = "Choose a valid timezone.";
      else fields[key] = "Please check this.";
    }
    throw new AppError("INVALID_INPUT", "Some of that needs another look.", 400, fields);
  }
  const { email, password, displayName } = parsed.data;
  const timezone = requireTimezone(parsed.data.timezone);

  if (hasClientAddress(ip)) assertNotLimited(`signup:ip:${ip}`, 8, SIGNUP_WINDOW, now);
  assertNotLimited(`signup:email:${email}`, 5, SIGNUP_WINDOW, now);

  const passwordHash = hashPassword(password);
  const userId = newId();
  const session = makeSession(userId, input.userAgent, now);
  try {
    transaction(() => {
      run(
        `INSERT INTO users (id, email, password_hash, display_name, timezone, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        userId,
        email,
        passwordHash,
        displayName,
        timezone,
        now,
        now,
      );
      insertSession(session, now);
    });
  } catch (error) {
    if (hasClientAddress(ip)) recordHit(`signup:ip:${ip}`, SIGNUP_WINDOW, now);
    recordHit(`signup:email:${email}`, SIGNUP_WINDOW, now);
    if (isUniqueViolation(error)) {
      throw new AppError("EMAIL_IN_USE", "An account with that email already exists.", 409);
    }
    throw error;
  }
  const user = one<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  if (!user) throw new AppError("INTERNAL", "Something went wrong. Please try again.", 500);
  return { token: session.token, user: publicUser(user), maxAgeSeconds: Math.floor(ABSOLUTE_MS / 1000) };
}

export function signIn(input: {
  email: string;
  password: string;
  userAgent?: string | null;
  ip?: string;
  now?: number;
}): SessionResult {
  const now = input.now ?? Date.now();
  const ip = input.ip ?? "local";
  const email = input.email.trim().toLowerCase();
  const emailKey = `signin:email:${email}`;
  const ipKey = `signin:ip:${ip}`;
  assertNotLimited(emailKey, 8, SIGNIN_WINDOW, now);
  if (hasClientAddress(ip)) assertNotLimited(ipKey, 40, SIGNIN_WINDOW, now);

  const user = one<UserRow>("SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", email);
  const ok = verifyPasswordOrDummy(input.password, user?.password_hash ?? null) && Boolean(user);
  if (!ok || !user) {
    recordHit(emailKey, SIGNIN_WINDOW, now);
    if (hasClientAddress(ip)) recordHit(ipKey, SIGNIN_WINDOW, now);
    throw new AppError("INVALID_CREDENTIALS", "That email or password did not match.", 401);
  }
  const session = makeSession(user.id, input.userAgent, now);
  insertSession(session, now);
  return { token: session.token, user: publicUser(user), maxAgeSeconds: Math.floor(ABSOLUTE_MS / 1000) };
}

export function signOut(token: string | null): void {
  if (!token) return;
  run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
}

export function userFromToken(token: string | null, now = Date.now()): PublicUser | null {
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = one<UserRow & { session_id: string; expires_at: number; last_seen_at: number }>(
    `SELECT u.*, s.id AS session_id, s.expires_at, s.last_seen_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    tokenHash,
  );
  if (!row) return null;
  if (row.deleted_at || row.expires_at <= now || now - row.last_seen_at > IDLE_MS) {
    run("DELETE FROM sessions WHERE id = ?", row.session_id);
    return null;
  }
  if (now - row.last_seen_at > TOUCH_MS) {
    run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", now, row.session_id);
  }
  return publicUser(row);
}

export function requireUser(userId: string): UserRow {
  const user = one<UserRow>("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", userId);
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return user;
}

export function updateAccount(
  userId: string,
  input: { displayName?: string; timezone?: string },
  now = Date.now(),
): PublicUser {
  const user = requireUser(userId);
  const displayName = input.displayName === undefined ? user.display_name : displayNameSchema.parse(input.displayName);
  const timezone = input.timezone === undefined ? user.timezone : requireTimezone(input.timezone);
  run("UPDATE users SET display_name = ?, timezone = ?, updated_at = ? WHERE id = ?", displayName, timezone, now, userId);
  return publicUser({ ...user, display_name: displayName, timezone, updated_at: now });
}

export function changePassword(
  userId: string,
  currentPassword: string,
  nextPassword: string,
  currentToken: string,
  now = Date.now(),
): void {
  const user = requireUser(userId);
  passwordSchema.parse(nextPassword);
  assertNotLimited(`password:${userId}`, 8, SIGNIN_WINDOW, now);
  if (!verifyPasswordOrDummy(currentPassword, user.password_hash)) {
    recordHit(`password:${userId}`, SIGNIN_WINDOW, now);
    throw new AppError("INVALID_CREDENTIALS", "That password did not match.", 401);
  }
  const passwordHash = hashPassword(nextPassword);
  const tokenHash = sha256(currentToken);
  transaction(() => {
    run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", passwordHash, now, userId);
    run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", userId, tokenHash);
  });
}

export function deleteAccount(userId: string, password: string, now = Date.now()): void {
  const user = requireUser(userId);
  if (!verifyPasswordOrDummy(password, user.password_hash)) {
    throw new AppError("INVALID_CREDENTIALS", "That password did not match.", 401);
  }
  transaction(() => {
    run("UPDATE users SET deleted_at = ?, updated_at = ?, email = ? WHERE id = ?", now, now, `deleted+${user.id}@invalid.bloom`, userId);
    run("DELETE FROM sessions WHERE user_id = ?", userId);
    run("DELETE FROM push_subscriptions WHERE user_id = ?", userId);
    const membership = one<{ relationship_id: string }>(
      `SELECT relationship_id FROM relationship_members WHERE user_id = ? AND left_at IS NULL`,
      userId,
    );
    if (membership) {
      dissolveRelationship(membership.relationship_id, now);
    }
    run(
      `UPDATE petals SET status = 'cancelled', deleted_at = ?, updated_at = ?
       WHERE sender_id = ? AND status = 'scheduled' AND deleted_at IS NULL`,
      now,
      now,
      userId,
    );
    run(
      `UPDATE notifications SET status = 'skipped', last_error = 'account_deleted'
       WHERE user_id = ? AND status IN ('pending', 'sending')`,
      userId,
    );
  });
}

export function dissolveRelationship(relationshipId: string, now: number): void {
  run(
    `UPDATE relationships SET status = 'dissolved', dissolved_at = ? WHERE id = ? AND status != 'dissolved'`,
    now,
    relationshipId,
  );
  run(`UPDATE relationship_members SET left_at = ? WHERE relationship_id = ? AND left_at IS NULL`, now, relationshipId);
  run(
    `UPDATE petals SET status = 'cancelled', updated_at = ?
     WHERE relationship_id = ? AND status = 'scheduled' AND deleted_at IS NULL`,
    now,
    relationshipId,
  );
  run(
    `UPDATE notifications SET status = 'skipped', last_error = 'relationship_dissolved'
     WHERE status IN ('pending', 'sending') AND petal_id IN (SELECT id FROM petals WHERE relationship_id = ?)`,
    relationshipId,
  );
}

function makeSession(userId: string, userAgent: string | null | undefined, now: number) {
  return {
    id: newId(),
    userId,
    token: newSessionToken(),
    userAgent: userAgent?.slice(0, 200) ?? null,
    expiresAt: now + ABSOLUTE_MS,
  };
}

function insertSession(session: ReturnType<typeof makeSession>, now: number): void {
  run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    session.id,
    session.userId,
    sha256(session.token),
    now,
    session.expiresAt,
    now,
    session.userAgent,
  );
}
