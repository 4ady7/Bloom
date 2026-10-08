import { newId } from "./crypto";
import { many, one, run } from "./db";
import type { QuietNote } from "@/domain/types";

export const DELIVERY_TITLE = "Bloom";
export const DELIVERY_BODY = "You have a little something waiting for you 🌷";
export const ANSWER_BODY = "They answered your question.";

export function insertDeliveryNotifications(input: {
  petalId: string;
  recipientId: string;
  now: number;
  pushEnabled: boolean;
}): void {
  run(
    `INSERT INTO notifications
      (id, user_id, petal_id, channel, kind, idempotency_key, title, body, status, attempt_count, next_attempt_at, last_error, created_at, sent_at, read_at)
     VALUES (?, ?, ?, 'in_app', 'delivery', ?, ?, ?, 'sent', 0, NULL, NULL, ?, ?, NULL)`,
    newId(),
    input.recipientId,
    input.petalId,
    `deliver:${input.petalId}:in_app`,
    DELIVERY_TITLE,
    DELIVERY_BODY,
    input.now,
    input.now,
  );
  if (input.pushEnabled) {
    run(
      `INSERT INTO notifications
        (id, user_id, petal_id, channel, kind, idempotency_key, title, body, status, attempt_count, next_attempt_at, last_error, created_at, sent_at, read_at)
       VALUES (?, ?, ?, 'web_push', 'delivery', ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL, NULL)`,
      newId(),
      input.recipientId,
      input.petalId,
      `deliver:${input.petalId}:web_push`,
      DELIVERY_TITLE,
      DELIVERY_BODY,
      input.now,
      input.now,
    );
  } else {
    run(
      `INSERT INTO notifications
        (id, user_id, petal_id, channel, kind, idempotency_key, title, body, status, attempt_count, next_attempt_at, last_error, created_at, sent_at, read_at)
       VALUES (?, ?, ?, 'web_push', 'delivery', ?, ?, ?, 'skipped', 0, NULL, 'push_not_configured', ?, NULL, NULL)`,
      newId(),
      input.recipientId,
      input.petalId,
      `deliver:${input.petalId}:web_push`,
      DELIVERY_TITLE,
      DELIVERY_BODY,
      input.now,
    );
  }
}

export function insertAnswerNotification(input: { petalId: string; recipientUserId: string; now: number }): void {
  run(
    `INSERT INTO notifications
      (id, user_id, petal_id, channel, kind, idempotency_key, title, body, status, attempt_count, next_attempt_at, last_error, created_at, sent_at, read_at)
     VALUES (?, ?, ?, 'in_app', 'answer', ?, ?, ?, 'sent', 0, NULL, NULL, ?, ?, NULL)`,
    newId(),
    input.recipientUserId,
    input.petalId,
    `answer:${input.petalId}:in_app`,
    DELIVERY_TITLE,
    ANSWER_BODY,
    input.now,
    input.now,
  );
}

export function markPetalNotificationsRead(userId: string, petalId: string, now: number): void {
  run(
    `UPDATE notifications SET status = 'read', read_at = ?
     WHERE user_id = ? AND petal_id = ? AND channel = 'in_app' AND status = 'sent'`,
    now,
    userId,
    petalId,
  );
}

export function markAnswerNotificationsRead(userId: string, petalId: string, now: number): void {
  run(
    `UPDATE notifications SET status = 'read', read_at = ?
     WHERE user_id = ? AND petal_id = ? AND channel = 'in_app' AND kind = 'answer' AND status = 'sent'`,
    now,
    userId,
    petalId,
  );
}

export function skipPendingNotifications(petalId: string, reason: string): void {
  run(
    `UPDATE notifications SET status = 'skipped', last_error = ?
     WHERE petal_id = ? AND status IN ('pending', 'sending')`,
    reason,
    petalId,
  );
}

export function listQuietNotes(userId: string): QuietNote[] {
  return many<{ id: string; petal_id: string | null; body: string; created_at: number }>(
    `SELECT id, petal_id, body, created_at FROM notifications
     WHERE user_id = ? AND channel = 'in_app' AND kind = 'answer' AND status = 'sent'
     ORDER BY created_at DESC LIMIT 3`,
    userId,
  ).map((row) => ({
    id: row.id,
    petalId: row.petal_id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export function notificationByKey(key: string): { id: string; status: string } | undefined {
  return one("SELECT id, status FROM notifications WHERE idempotency_key = ?", key);
}
