import { canonicalJson } from "@/domain/json";
import { createPetalSchema, expectedMediaKind, mediaIdsOf, parseContent, updatePetalSchema } from "@/domain/content";
import {
  selectFlowerVariety,
  selectPetalType,
  selectQuestion,
  selectSurpriseKind,
  type RecentPetal,
} from "@/domain/random";
import { localToUtcIso, seasonFor, TimeInputError } from "@/domain/time";
import type { GardenElement, PetalContent, PetalMetadata, PetalStatus, PetalType, PublicPetal, PublicUser, QuietNote, Season } from "@/domain/types";
import { requireUser } from "./auth";
import { sha256, newId } from "./crypto";
import { many, one, run, transaction } from "./db";
import { bloomGarden, insertGarden, removeGarden } from "./deliver";
import { AppError, isUniqueViolation } from "./errors";
import { assertMediaUsable } from "./media";
import {
  insertAnswerNotification,
  insertDeliveryNotifications,
  listQuietNotes,
  markPetalNotificationsRead,
  skipPendingNotifications,
} from "./notifications";
import { processPushQueue, pushConfigured } from "./push";
import { hitOrThrow } from "./rate-limit";
import { getRelationship, requireActiveRelationship, type RelationshipState } from "./relationship";

const YEAR_MS = 366 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface PetalRow {
  id: string;
  relationship_id: string;
  sender_id: string;
  recipient_id: string;
  type: PetalType;
  content_json: string;
  metadata_json: string;
  request_hash: string;
  idempotency_key: string;
  status: PetalStatus;
  sender_timezone: string;
  scheduled_for: number | null;
  opened_at: number | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  sender_name: string | null;
  sender_deleted: number | null;
}

export interface HomeState {
  user: PublicUser;
  relationship: RelationshipState | null;
  unopened: PublicPetal[];
  recent: PublicPetal[];
  upcoming: PublicPetal[];
  garden: { season: Season; elements: GardenElement[] };
  notes: QuietNote[];
}

export async function getHome(userId: string, now = Date.now()): Promise<HomeState> {
  await deliverDuePetalsSafe(now);
  const user = requireUser(userId);
  const relationship = getRelationship(userId);
  const viewer: PublicUser = {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    timezone: user.timezone,
  };
  if (!relationship || relationship.status !== "active") {
    return {
      user: viewer,
      relationship,
      unopened: [],
      recent: [],
      upcoming: [],
      garden: { season: seasonFor(now, user.timezone), elements: [] },
      notes: [],
    };
  }
  return {
    user: viewer,
    relationship,
    unopened: listVisible(userId, relationship.id, "AND p.recipient_id = ? AND p.status = 'sealed' ORDER BY p.created_at ASC LIMIT 12", [userId]),
    recent: listVisible(userId, relationship.id, "AND p.status IN ('sealed', 'opened', 'expired') ORDER BY p.created_at DESC LIMIT 8", []),
    upcoming: listVisible(userId, relationship.id, "AND p.sender_id = ? AND p.status = 'scheduled' ORDER BY p.scheduled_for ASC LIMIT 8", [userId]),
    garden: loadGarden(relationship.id, user.timezone, now),
    notes: listQuietNotes(userId),
  };
}

function listVisible(
  viewerId: string,
  relationshipId: string,
  tail: string,
  tailParams: (string | number)[],
): PublicPetal[] {
  return many<PetalRow>(
    `${visibleSelect()} AND p.relationship_id = ? ${tail}`,
    viewerId,
    viewerId,
    viewerId,
    relationshipId,
    ...tailParams,
  ).map((row) => toPublic(row, viewerId));
}

export function listPetals(
  userId: string,
  cursor: string | null,
  limit = 20,
): { petals: PublicPetal[]; nextCursor: string | null } {
  const relationship = requireActiveRelationship(userId);
  const size = Math.min(Math.max(limit, 1), 30);
  const position = decodeCursor(cursor);
  const rows = many<PetalRow>(
    `${visibleSelect()} AND p.relationship_id = ? AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))
     ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    userId,
    userId,
    userId,
    relationship.id,
    position.createdAt,
    position.createdAt,
    position.id,
    size + 1,
  );
  const page = rows.slice(0, size).map((row) => toPublic(row, userId));
  const next = rows.length > size ? encodeCursor(rows[size - 1].created_at, rows[size - 1].id) : null;
  return { petals: page, nextCursor: next };
}

export function getPetal(userId: string, petalId: string): PublicPetal {
  const row = visibleRow(userId, petalId);
  if (!row) throw new AppError("NOT_FOUND", "This isn't here.", 404);
  return toPublic(row, userId);
}

export async function createPetal(
  userId: string,
  idempotencyKey: string,
  body: unknown,
  now = Date.now(),
): Promise<{ petal: PublicPetal; replayed: boolean }> {
  hitOrThrow(`petal:${userId}`, 40, 60 * 60 * 1000, now);
  const user = requireUser(userId);
  const relationship = requireActiveRelationship(userId);
  const input = createPetalSchema.parse(body);
  const content = parseContent(input.type, input.content);
  assertOwnedMedia(userId, relationship.id, input.type, content);
  const scheduledFor = resolveSchedule(input.schedule, user.timezone, now);
  const requestHash = sha256(
    canonicalJson({
      type: input.type,
      content,
      schedule: input.schedule,
      expiresInDays: input.expiresInDays,
      random: input.random,
    }),
  );
  const existing = one<PetalRow>(`${baseSelect()} WHERE p.sender_id = ? AND p.idempotency_key = ?`, userId, idempotencyKey);
  if (existing) return replay(existing, requestHash, userId);

  const id = newId();
  const deliverNow = scheduledFor === null || scheduledFor <= now;
  const status: PetalStatus = deliverNow ? "sealed" : "scheduled";
  const base = deliverNow ? now : scheduledFor;
  const expiresAt = input.expiresInDays ? base + input.expiresInDays * DAY_MS : null;
  const metadata: PetalMetadata = {
    source: input.random ? "random" : "chosen",
    ...(input.type === "flower" ? { variety: (content as { variety: string }).variety } : {}),
    ...(input.type === "surprise" ? { surpriseKind: (content as { kind: string }).kind } : {}),
    ...(input.type === "question" && (content as { questionId?: string }).questionId
      ? { questionId: (content as { questionId?: string }).questionId }
      : {}),
  };
  try {
    transaction(() => {
      run(
        `INSERT INTO petals (
          id, relationship_id, sender_id, recipient_id, type, content_json, metadata_json, request_hash,
          idempotency_key, status, sender_timezone, scheduled_for, opened_at, expires_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)`,
        id,
        relationship.id,
        userId,
        relationship.partner.id,
        input.type,
        JSON.stringify(content),
        JSON.stringify(metadata),
        requestHash,
        idempotencyKey,
        status,
        user.timezone,
        scheduledFor,
        expiresAt,
        now,
        now,
      );
      if (status === "sealed") {
        insertGarden({ id, relationship_id: relationship.id, type: input.type, content_json: JSON.stringify(content) }, now);
        insertDeliveryNotifications({
          petalId: id,
          recipientId: relationship.partner.id,
          now,
          pushEnabled: pushConfigured(),
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = one<PetalRow>(`${baseSelect()} WHERE p.sender_id = ? AND p.idempotency_key = ?`, userId, idempotencyKey);
      if (again) return replay(again, requestHash, userId);
    }
    throw error;
  }
  await flushPush();
  const created = one<PetalRow>(`${baseSelect()} WHERE p.id = ?`, id);
  if (!created) throw new AppError("INTERNAL", "Something went wrong. Please try again.", 500);
  return { petal: toPublic(created, userId), replayed: false };
}

export async function updateScheduledPetal(userId: string, petalId: string, body: unknown, now = Date.now()): Promise<PublicPetal> {
  const user = requireUser(userId);
  const relationship = requireActiveRelationship(userId);
  const input = updatePetalSchema.parse(body);
  const current = one<PetalRow>(`${baseSelect()} WHERE p.id = ? AND p.sender_id = ?`, petalId, userId);
  if (!current || current.deleted_at || current.relationship_id !== relationship.id) {
    throw new AppError("NOT_FOUND", "This isn't here.", 404);
  }
  if (current.status !== "scheduled") {
    throw new AppError("NOT_EDITABLE", "This has already left. It can't be changed.", 409);
  }
  if (current.updated_at !== input.expectedUpdatedAt) {
    throw new AppError("STALE", "This changed somewhere else. Look again, then retry.", 409);
  }
  const content = parseContent(current.type, input.content);
  assertOwnedMedia(userId, relationship.id, current.type, content);
  const scheduledFor = resolveSchedule(input.schedule, user.timezone, now);
  const deliverNow = scheduledFor === null || scheduledFor <= now;
  const base = deliverNow ? now : (scheduledFor as number);
  const expiresAt = input.expiresInDays ? base + input.expiresInDays * DAY_MS : null;
  transaction(() => {
    const locked = one<{ status: string; updated_at: number }>(
      "SELECT status, updated_at FROM petals WHERE id = ? AND sender_id = ? AND deleted_at IS NULL",
      petalId,
      userId,
    );
    if (!locked || locked.status !== "scheduled" || locked.updated_at !== input.expectedUpdatedAt) {
      throw new AppError("STALE", "This changed somewhere else. Look again, then retry.", 409);
    }
    if (deliverNow) {
      run(
        `UPDATE petals SET content_json = ?, status = 'sealed', scheduled_for = NULL, expires_at = ?, updated_at = ?, sender_timezone = ?
         WHERE id = ? AND status = 'scheduled'`,
        JSON.stringify(content),
        expiresAt,
        now,
        user.timezone,
        petalId,
      );
      insertGarden(
        { id: petalId, relationship_id: relationship.id, type: current.type, content_json: JSON.stringify(content) },
        now,
      );
      insertDeliveryNotifications({
        petalId,
        recipientId: relationship.partner.id,
        now,
        pushEnabled: pushConfigured(),
      });
    } else {
      run(
        `UPDATE petals SET content_json = ?, scheduled_for = ?, expires_at = ?, updated_at = ?, sender_timezone = ?
         WHERE id = ? AND status = 'scheduled'`,
        JSON.stringify(content),
        scheduledFor,
        expiresAt,
        now,
        user.timezone,
        petalId,
      );
    }
  });
  await flushPush();
  return getPetal(userId, petalId);
}

export function deletePetal(userId: string, petalId: string, now = Date.now()): { ok: true } {
  const relationship = getRelationship(userId);
  transaction(() => {
    const row = one<PetalRow>(`${baseSelect()} WHERE p.id = ? AND p.sender_id = ?`, petalId, userId);
    if (!row || !relationship || row.relationship_id !== relationship.id) {
      throw new AppError("NOT_FOUND", "This isn't here.", 404);
    }
    if (row.deleted_at || row.status === "cancelled") return;
    if (row.status === "opened" || row.status === "expired") {
      throw new AppError("NOT_DELETABLE", "They've already had this. It stays in the garden.", 409);
    }
    run(
      `UPDATE petals SET status = 'cancelled', deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND status IN ('scheduled', 'sealed')`,
      now,
      now,
      petalId,
    );
    removeGarden(petalId);
    skipPendingNotifications(petalId, "deleted");
    run(
      `UPDATE notifications SET status = 'skipped', last_error = 'deleted'
       WHERE petal_id = ? AND channel = 'in_app' AND kind = 'delivery' AND status = 'sent'`,
      petalId,
    );
  });
  return { ok: true };
}

export function openPetal(userId: string, petalId: string, now = Date.now()): PublicPetal {
  const outcome = transaction(() => {
    const row = one<PetalRow>(`${baseSelect()} WHERE p.id = ?`, petalId);
    if (!row || row.deleted_at) throw new AppError("NOT_FOUND", "This isn't here.", 404);
    const relationship = getRelationship(userId);
    if (!relationship || relationship.id !== row.relationship_id || relationship.status !== "active") {
      throw new AppError("NOT_FOUND", "This isn't here.", 404);
    }
    if (row.sender_id === userId && row.recipient_id !== userId) {
      throw new AppError("NOT_YOURS_TO_OPEN", "You already know this one.", 403);
    }
    if (row.recipient_id !== userId) throw new AppError("NOT_FOUND", "This isn't here.", 404);
    if (row.status === "opened") return "opened" as const;
    if (row.status === "expired") return "expired" as const;
    if (row.status !== "sealed") throw new AppError("NOT_FOUND", "This isn't here.", 404);
    if (row.expires_at && row.expires_at <= now) {
      run(`UPDATE petals SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'sealed'`, now, petalId);
      run(`UPDATE garden_elements SET stage = 'withered' WHERE petal_id = ?`, petalId);
      return "expired" as const;
    }
    const changed = run(
      `UPDATE petals SET status = 'opened', opened_at = ?, updated_at = ? WHERE id = ? AND status = 'sealed'`,
      now,
      now,
      petalId,
    );
    if (changed.changes === 1) {
      bloomGarden(petalId, now);
      markPetalNotificationsRead(userId, petalId, now);
    }
    return "opened" as const;
  });
  if (outcome === "expired") throw new AppError("EXPIRED", "This faded before it was opened.", 410);
  return getPetal(userId, petalId);
}

export function answerPetal(userId: string, petalId: string, idempotencyKey: string, body: unknown, now = Date.now()): PublicPetal {
  const answer = parseAnswer(body);
  transaction(() => {
    const row = visibleRow(userId, petalId);
    if (!row) throw new AppError("NOT_FOUND", "This isn't here.", 404);
    if (row.type !== "question") throw new AppError("NOT_A_QUESTION", "There isn't a question here.", 409);
    if (row.recipient_id !== userId) throw new AppError("NOT_YOURS_TO_OPEN", "This question wasn't for you.", 403);
    if (row.status !== "opened") throw new AppError("NOT_READY", "Open it first, if you want to answer.", 409);
    const byKey = one<{ petal_id: string; body: string }>(
      "SELECT petal_id, body FROM petal_responses WHERE author_id = ? AND idempotency_key = ?",
      userId,
      idempotencyKey,
    );
    if (byKey) {
      if (byKey.petal_id === petalId && byKey.body === answer) return;
      throw new AppError("IDEMPOTENCY_CONFLICT", "That attempt was already used. Start a new one.", 409);
    }
    const existing = one<{ body: string }>("SELECT body FROM petal_responses WHERE petal_id = ?", petalId);
    if (existing) {
      if (existing.body === answer) return;
      throw new AppError("ALREADY_ANSWERED", "You already left an answer.", 409);
    }
    run(
      `INSERT INTO petal_responses (id, petal_id, author_id, body, created_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)`,
      newId(),
      petalId,
      userId,
      answer,
      now,
      idempotencyKey,
    );
    insertAnswerNotification({ petalId, recipientUserId: row.sender_id, now });
  });
  return getPetal(userId, petalId);
}

export function suggestPetal(userId: string, avoidType: string | null, now = Date.now()) {
  hitOrThrow(`suggest:${userId}`, 60, 60 * 60 * 1000, now);
  const relationship = requireActiveRelationship(userId);
  const history = recentHistory(userId, relationship.id);
  const type = selectPetalType({ history, now, avoidType: avoidType ?? undefined });
  const content = starterFor(type, history);
  const metadata: PetalMetadata = { source: "random" };
  return { type, content, metadata };
}

function starterFor(type: PetalType, history: RecentPetal[]) {
  const rng = Math.random;
  if (type === "flower") {
    const variety = selectFlowerVariety(
      history.map((item) => item.variety),
      rng,
    );
    return { variety, note: "" };
  }
  if (type === "question") {
    const question = selectQuestion(
      history.map((item) => item.questionId),
      rng,
    );
    return { prompt: question.prompt, senderNote: "", questionId: question.id };
  }
  if (type === "surprise") {
    const kind = selectSurpriseKind(
      history.map((item) => item.surpriseKind),
      rng,
    );
    return { kind, message: "" };
  }
  if (type === "memory") return { title: "", date: "", place: "", text: "", mediaId: null };
  return { text: "" };
}

function recentHistory(userId: string, relationshipId: string): RecentPetal[] {
  const rows = many<{ type: string; content_json: string; metadata_json: string; created_at: number }>(
    `SELECT type, content_json, metadata_json, created_at FROM petals
     WHERE sender_id = ? AND relationship_id = ? AND deleted_at IS NULL AND status != 'cancelled'
     ORDER BY created_at DESC LIMIT 8`,
    userId,
    relationshipId,
  );
  return rows.map((row) => {
    const content = safeParse(row.content_json);
    const metadata = safeParse(row.metadata_json);
    return {
      type: row.type,
      createdAt: row.created_at,
      questionId: typeof metadata.questionId === "string" ? metadata.questionId : typeof content.questionId === "string" ? content.questionId : undefined,
      variety: typeof content.variety === "string" ? content.variety : undefined,
      surpriseKind: typeof content.kind === "string" ? content.kind : undefined,
    };
  });
}

function resolveSchedule(
  schedule: { year: number; month: number; day: number; hour: number; minute: number } | null,
  timeZone: string,
  now: number,
): number | null {
  if (!schedule) return null;
  let iso: string;
  try {
    iso = localToUtcIso(schedule, timeZone);
  } catch (error) {
    if (error instanceof TimeInputError) throw new AppError("INVALID_TIME", error.message, 400);
    throw error;
  }
  const scheduledFor = Date.parse(iso);
  if (Number.isNaN(scheduledFor)) throw new AppError("INVALID_TIME", "That time could not be saved.", 400);
  if (scheduledFor < now - 60_000) {
    throw new AppError("INVALID_TIME", "Choose a time that hasn't already passed.", 400);
  }
  if (scheduledFor > now + YEAR_MS) {
    throw new AppError("INVALID_TIME", "Bloom only holds something up to a year ahead.", 400);
  }
  return scheduledFor;
}

function assertOwnedMedia(userId: string, relationshipId: string, type: PetalType, content: PetalContent): void {
  const kind = expectedMediaKind(type);
  if (!kind) return;
  for (const mediaId of mediaIdsOf(type, content)) {
    assertMediaUsable({ userId, relationshipId, mediaId, kind });
  }
}

function replay(existing: PetalRow, requestHash: string, viewerId: string): { petal: PublicPetal; replayed: boolean } {
  if (existing.request_hash !== requestHash || existing.deleted_at || existing.status === "cancelled") {
    throw new AppError("IDEMPOTENCY_CONFLICT", "That attempt was already used. Start a new one if you still want to leave something.", 409);
  }
  return { petal: toPublic(existing, viewerId), replayed: true };
}

function parseAnswer(body: unknown): string {
  if (!body || typeof body !== "object") throw new AppError("INVALID_INPUT", "Write a little answer first.", 400);
  const text = (body as { body?: unknown }).body;
  if (typeof text !== "string" || text.trim().length === 0 || text.trim().length > 1000) {
    throw new AppError("INVALID_INPUT", "Keep the answer to a few words, up to a short note.", 400, {
      body: "Write a short answer.",
    });
  }
  return text.trim();
}

function visibleRow(userId: string, petalId: string): PetalRow | undefined {
  return one<PetalRow>(`${visibleSelect()} AND p.id = ?`, userId, userId, userId, petalId);
}

function visibleSelect(): string {
  return `${baseSelect()}
    JOIN relationship_members mem ON mem.relationship_id = p.relationship_id AND mem.user_id = ? AND mem.left_at IS NULL
    JOIN relationships r ON r.id = p.relationship_id AND r.status = 'active'
    WHERE p.deleted_at IS NULL AND p.status != 'cancelled'
    AND (
      p.sender_id = ?
      OR (p.recipient_id = ? AND p.status IN ('sealed', 'opened', 'expired'))
    )`;
}

function baseSelect(): string {
  return `SELECT p.*, su.display_name AS sender_name, su.deleted_at AS sender_deleted
    FROM petals p
    JOIN users su ON su.id = p.sender_id`;
}

function toPublic(row: PetalRow, viewerId: string): PublicPetal {
  const response = one<{ body: string; created_at: number }>(
    "SELECT body, created_at FROM petal_responses WHERE petal_id = ?",
    row.id,
  );
  return {
    id: row.id,
    type: row.type,
    content: JSON.parse(row.content_json) as PetalContent,
    metadata: JSON.parse(row.metadata_json) as PetalMetadata,
    status: row.status,
    fromYou: row.sender_id === viewerId,
    senderName: row.sender_deleted ? "Someone" : row.sender_name || "Someone",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scheduledFor: row.scheduled_for,
    openedAt: row.opened_at,
    expiresAt: row.expires_at,
    response: response ? { body: response.body, createdAt: response.created_at } : null,
  };
}

function loadGarden(relationshipId: string, timeZone: string, now: number): { season: Season; elements: GardenElement[] } {
  const rows = many<{
    id: string;
    petal_id: string;
    kind: GardenElement["kind"];
    variant: string;
    stage: GardenElement["stage"];
    created_at: number;
  }>(
    `SELECT g.id, g.petal_id, g.kind, g.variant, g.stage, g.created_at
     FROM garden_elements g
     JOIN petals p ON p.id = g.petal_id AND p.deleted_at IS NULL
     WHERE g.relationship_id = ?
     ORDER BY g.created_at ASC
     LIMIT 80`,
    relationshipId,
  );
  return {
    season: seasonFor(now, timeZone),
    elements: rows.map((row) => ({
      id: row.id,
      petalId: row.petal_id,
      kind: row.kind,
      variant: row.variant,
      stage: row.stage,
      createdAt: row.created_at,
    })),
  };
}

function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string | null): { createdAt: number; id: string } {
  if (!cursor) return { createdAt: Number.MAX_SAFE_INTEGER, id: "ffffffff-ffff-4fff-bfff-ffffffffffff" };
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const [createdRaw, id] = decoded.split("|");
    const createdAt = Number(createdRaw);
    if (!Number.isFinite(createdAt) || !id || !/^[0-9a-f-]{36}$/i.test(id)) {
      throw new Error("bad cursor");
    }
    return { createdAt, id };
  } catch {
    throw new AppError("INVALID_INPUT", "That page could not be read.", 400);
  }
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function flushPush(): Promise<void> {
  try {
    await processPushQueue();
  } catch (error) {
    const message = error instanceof Error ? error.message : "push failed";
    console.error(JSON.stringify({ level: "error", area: "push", message }));
  }
}

async function deliverDuePetalsSafe(now: number): Promise<void> {
  const { deliverDuePetals } = await import("./deliver");
  await deliverDuePetals(now);
}
