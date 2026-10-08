import { GARDEN_KIND, type PetalType } from "@/domain/types";
import { newId } from "./crypto";
import { many, one, run, transaction } from "./db";
import { insertDeliveryNotifications, skipPendingNotifications } from "./notifications";
import { processPushQueue, pushConfigured } from "./push";

interface DuePetal {
  id: string;
  relationship_id: string;
  type: string;
  content_json: string;
  status: string;
  deleted_at: number | null;
  expires_at: number | null;
  recipient_id: string;
}

let working = false;

export async function deliverDuePetals(now = Date.now()): Promise<number> {
  if (working) return 0;
  working = true;
  try {
    const delivered = deliverDueSync(now);
    await processPushQueue(now);
    return delivered;
  } finally {
    working = false;
  }
}

function deliverDueSync(now: number): number {
  const due = many<{ id: string }>(
    `SELECT id FROM petals
     WHERE status = 'scheduled' AND deleted_at IS NULL AND scheduled_for IS NOT NULL AND scheduled_for <= ?
     ORDER BY scheduled_for ASC
     LIMIT 50`,
    now,
  );
  let delivered = 0;
  for (const row of due) {
    const did = transaction(() => settleScheduled(row.id, now));
    if (did) delivered += 1;
  }
  const fading = many<{ id: string }>(
    `SELECT id FROM petals
     WHERE status = 'sealed' AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?
     LIMIT 50`,
    now,
  );
  for (const row of fading) {
    transaction(() => expireSealed(row.id, now));
  }
  return delivered;
}

function settleScheduled(id: string, now: number): boolean {
  const petal = one<DuePetal>("SELECT id, relationship_id, type, content_json, status, deleted_at, expires_at, recipient_id FROM petals WHERE id = ?", id);
  if (!petal || petal.deleted_at || petal.status !== "scheduled") return false;
  if (petal.expires_at && petal.expires_at <= now) {
    run(
      `UPDATE petals SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled' AND deleted_at IS NULL`,
      now,
      id,
    );
    return false;
  }
  const sealed = run(
    `UPDATE petals SET status = 'sealed', updated_at = ? WHERE id = ? AND status = 'scheduled' AND deleted_at IS NULL`,
    now,
    id,
  );
  if (sealed.changes !== 1) return false;
  insertGarden(petal, now);
  insertDeliveryNotifications({
    petalId: petal.id,
    recipientId: petal.recipient_id,
    now,
    pushEnabled: pushConfigured(),
  });
  return true;
}

function expireSealed(id: string, now: number): void {
  const changed = run(
    `UPDATE petals SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'sealed' AND deleted_at IS NULL`,
    now,
    id,
  );
  if (changed.changes !== 1) return;
  run(`UPDATE garden_elements SET stage = 'withered' WHERE petal_id = ?`, id);
  skipPendingNotifications(id, "expired");
}

export function insertGarden(
  petal: { id: string; relationship_id: string; type: string; content_json: string },
  now: number,
): void {
  const type = petal.type as PetalType;
  const kind = GARDEN_KIND[type] ?? "leaf";
  let variant = "soft";
  try {
    const content = JSON.parse(petal.content_json) as { variety?: string; kind?: string };
    if (type === "flower" && content.variety) variant = content.variety;
    if (type === "surprise" && content.kind) variant = content.kind;
  } catch {
    variant = "soft";
  }
  run(
    `INSERT INTO garden_elements (id, relationship_id, petal_id, kind, variant, stage, created_at, bloomed_at)
     VALUES (?, ?, ?, ?, ?, 'bud', ?, NULL)`,
    newId(),
    petal.relationship_id,
    petal.id,
    kind,
    variant,
    now,
  );
}

export function bloomGarden(petalId: string, now: number): void {
  run(`UPDATE garden_elements SET stage = 'bloom', bloomed_at = ? WHERE petal_id = ? AND stage = 'bud'`, now, petalId);
}

export function removeGarden(petalId: string): void {
  run(`DELETE FROM garden_elements WHERE petal_id = ?`, petalId);
}
