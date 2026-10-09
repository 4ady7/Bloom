import { generateInviteCode, hashInviteCode, newId, normalizeInviteCode } from "./crypto";
import { one, run, transaction } from "./db";
import { AppError } from "./errors";
import { hitOrThrow } from "./rate-limit";
import { dissolveRelationship, requireUser } from "./auth";

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

export interface RelationshipState {
  id: string;
  status: "pending" | "active" | "dissolved";
  partner: { id: string; displayName: string } | null;
}

export function getRelationship(userId: string): RelationshipState | null {
  const membership = one<{ relationship_id: string; status: RelationshipState["status"] }>(
    `SELECT m.relationship_id, r.status
     FROM relationship_members m
     JOIN relationships r ON r.id = m.relationship_id
     WHERE m.user_id = ? AND m.left_at IS NULL AND r.status != 'dissolved'`,
    userId,
  );
  if (!membership) return null;
  const partner = one<{ id: string; display_name: string }>(
    `SELECT u.id, u.display_name FROM relationship_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.relationship_id = ? AND m.user_id != ? AND m.left_at IS NULL AND u.deleted_at IS NULL`,
    membership.relationship_id,
    userId,
  );
  return {
    id: membership.relationship_id,
    status: membership.status,
    partner: partner ? { id: partner.id, displayName: partner.display_name } : null,
  };
}

export function requireActiveRelationship(userId: string): RelationshipState & { partner: { id: string; displayName: string } } {
  const relationship = getRelationship(userId);
  if (!relationship || relationship.status !== "active" || !relationship.partner) {
    throw new AppError("NO_RELATIONSHIP", "This stays empty until it's just the two of you.", 409);
  }
  return relationship as RelationshipState & { partner: { id: string; displayName: string } };
}

export function createInvite(userId: string, now = Date.now()): { code: string; expiresAt: number } {
  requireUser(userId);
  hitOrThrow(`invite:${userId}`, 10, 60 * 60 * 1000, now);
  const existing = getRelationship(userId);
  if (existing?.status === "active") {
    throw new AppError("ALREADY_PAIRED", "You already have someone.", 409);
  }
  const code = generateInviteCode();
  const codeHash = hashInviteCode(code);
  const expiresAt = now + INVITE_TTL;
  transaction(() => {
    let relationshipId = existing?.id;
    if (!relationshipId) {
      relationshipId = newId();
      run(
        `INSERT INTO relationships (id, status, created_at, activated_at, dissolved_at) VALUES (?, 'pending', ?, NULL, NULL)`,
        relationshipId,
        now,
      );
      run(
        `INSERT INTO relationship_members (relationship_id, user_id, joined_at, left_at) VALUES (?, ?, ?, NULL)`,
        relationshipId,
        userId,
        now,
      );
    }
    run(`UPDATE invites SET revoked_at = ? WHERE created_by = ? AND used_at IS NULL AND revoked_at IS NULL`, now, userId);
    run(
      `INSERT INTO invites (id, code_hash, relationship_id, created_by, created_at, expires_at, used_by, used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      newId(),
      codeHash,
      relationshipId,
      userId,
      now,
      expiresAt,
    );
  });
  return { code, expiresAt };
}

export function joinWithCode(userId: string, rawCode: string, now = Date.now()): RelationshipState {
  requireUser(userId);
  hitOrThrow(`join:${userId}`, 10, 60 * 60 * 1000, now);
  const normalized = normalizeInviteCode(rawCode);
  if (normalized.length < 8) {
    throw new AppError("INVITE_INVALID", "That code did not work. It may have expired.", 400);
  }
  if (getRelationship(userId)) {
    throw new AppError("ALREADY_PAIRED", "You already have a private place.", 409);
  }
  const codeHash = hashInviteCode(normalized);
  try {
    transaction(() => {
      const invite = one<{
        id: string;
        relationship_id: string;
        created_by: string;
        expires_at: number;
        used_at: number | null;
        revoked_at: number | null;
      }>("SELECT * FROM invites WHERE code_hash = ?", codeHash);
      if (
        !invite ||
        invite.used_at ||
        invite.revoked_at ||
        invite.expires_at <= now ||
        invite.created_by === userId
      ) {
        throw new AppError("INVITE_INVALID", "That code did not work. It may have expired.", 400);
      }
      run(`UPDATE relationships SET status = status WHERE id = ?`, invite.relationship_id);
      const members = one<{ count: number }>(
        `SELECT COUNT(*) AS count FROM relationship_members WHERE relationship_id = ? AND left_at IS NULL`,
        invite.relationship_id,
      );
      if (!members || Number(members.count) !== 1) {
        throw new AppError("INVITE_INVALID", "That code did not work. It may have expired.", 400);
      }
      const relationship = one<{ status: string }>("SELECT status FROM relationships WHERE id = ?", invite.relationship_id);
      if (!relationship || relationship.status !== "pending") {
        throw new AppError("INVITE_INVALID", "That code did not work. It may have expired.", 400);
      }
      run(
        `INSERT INTO relationship_members (relationship_id, user_id, joined_at, left_at) VALUES (?, ?, ?, NULL)`,
        invite.relationship_id,
        userId,
        now,
      );
      run(`UPDATE relationships SET status = 'active', activated_at = ? WHERE id = ?`, now, invite.relationship_id);
      run(`UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?`, userId, now, invite.id);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw new AppError("ALREADY_PAIRED", "You already have a private place.", 409);
    }
    throw error;
  }
  const relationship = getRelationship(userId);
  if (!relationship) throw new AppError("INTERNAL", "Something went wrong. Please try again.", 500);
  ensureDefaultGardenRow(relationship.id, userId, now);
  return relationship;
}

function ensureDefaultGardenRow(relationshipId: string, createdBy: string, now: number): void {
  const existing = one<{ id: string }>(
    `SELECT id FROM gardens WHERE relationship_id = ? AND is_primary = 1 AND archived_at IS NULL`,
    relationshipId,
  );
  if (existing) return;
  try {
    run(
      `INSERT INTO gardens (id, relationship_id, name, description, theme, is_primary, created_by, created_at, updated_at, archived_at)
       VALUES (?, ?, 'Our Garden', '', 'meadow', 1, ?, ?, ?, NULL)`,
      newId(),
      relationshipId,
      createdBy,
      now,
      now,
    );
  } catch {
    /* migration or concurrent create may already have one */
  }
}

export function leaveRelationship(userId: string, now = Date.now()): void {
  const relationship = getRelationship(userId);
  if (!relationship) return;
  transaction(() => {
    dissolveRelationship(relationship.id, now);
  });
}

