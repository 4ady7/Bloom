import { z } from "zod";
import { defaultStyleFor, isFlowerKey, isFlowerStyle, normalizeFlowerKey } from "@/domain/flowers";
import {
  GARDEN_THEMES,
  MAX_FLOWERS_PER_GARDEN,
  MAX_GARDENS_PER_RELATIONSHIP,
  isGardenTheme,
  placeInGarden,
  type GardenTheme,
  type PublicGarden,
  type PublicGardenFlower,
} from "@/domain/garden";
import type { FlowerContent } from "@/domain/types";
import { newId } from "./crypto";
import { many, one, run, transaction } from "./db";
import { AppError, isUniqueViolation } from "./errors";
import { hitOrThrow } from "./rate-limit";
import { requireActiveRelationship } from "./relationship";

interface GardenRow {
  id: string;
  relationship_id: string;
  name: string;
  description: string;
  theme: string;
  is_primary: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  flower_count?: number;
}

interface FlowerRow {
  id: string;
  garden_id: string;
  relationship_id: string;
  flower_key: string;
  style: string;
  asset_kind: "builtin" | "generated";
  asset_ref: string | null;
  petal_id: string | null;
  given_by: string;
  planted_by: string;
  message: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  planted_at: number;
  removed_at: number | null;
  created_at: number;
  updated_at: number;
  given_name: string | null;
  planted_name: string | null;
  given_deleted: number | null;
  planted_deleted: number | null;
}

const nameSchema = z.string().trim().min(1).max(60);
const descriptionSchema = z.string().trim().max(280).optional().default("");

export function ensurePrimaryGarden(relationshipId: string, createdBy: string, now = Date.now()): string {
  const existing = one<GardenRow>(
    `SELECT * FROM gardens WHERE relationship_id = ? AND is_primary = 1 AND archived_at IS NULL`,
    relationshipId,
  );
  if (existing) return existing.id;
  const id = newId();
  run(
    `INSERT INTO gardens (id, relationship_id, name, description, theme, is_primary, created_by, created_at, updated_at, archived_at)
     VALUES (?, ?, 'Our Garden', '', 'meadow', 1, ?, ?, ?, NULL)`,
    id,
    relationshipId,
    createdBy,
    now,
    now,
  );
  return id;
}

export function listGardens(userId: string): PublicGarden[] {
  const relationship = requireActiveRelationship(userId);
  ensurePrimaryGarden(relationship.id, userId);
  return many<GardenRow>(
    `SELECT g.*,
      (SELECT COUNT(*) FROM garden_flowers f WHERE f.garden_id = g.id AND f.removed_at IS NULL) AS flower_count
     FROM gardens g
     WHERE g.relationship_id = ? AND g.archived_at IS NULL
     ORDER BY g.is_primary DESC, g.created_at ASC`,
    relationship.id,
  ).map(toPublicGarden);
}

export function getGarden(userId: string, gardenId: string): PublicGarden {
  const row = requireGardenAccess(userId, gardenId);
  const count = one<{ count: number }>(
    `SELECT COUNT(*) AS count FROM garden_flowers WHERE garden_id = ? AND removed_at IS NULL`,
    gardenId,
  );
  return toPublicGarden({ ...row, flower_count: Number(count?.count ?? 0) });
}

export function listGardenFlowers(
  userId: string,
  gardenId: string,
  cursor: string | null,
  limit = 80,
): { flowers: PublicGardenFlower[]; nextCursor: string | null } {
  requireGardenAccess(userId, gardenId);
  const size = Math.min(Math.max(limit, 1), 120);
  const position = decodeCursor(cursor);
  const rows = many<FlowerRow>(
    `${flowerSelect()}
     WHERE f.garden_id = ? AND f.removed_at IS NULL
       AND (f.planted_at > ? OR (f.planted_at = ? AND f.id > ?))
     ORDER BY f.planted_at ASC, f.id ASC
     LIMIT ?`,
    gardenId,
    position.plantedAt,
    position.plantedAt,
    position.id,
    size + 1,
  );
  const page = rows.slice(0, size).map(toPublicFlower);
  const next =
    rows.length > size ? encodeCursor(rows[size - 1].planted_at, rows[size - 1].id) : null;
  return { flowers: page, nextCursor: next };
}

export function createGarden(
  userId: string,
  body: unknown,
  now = Date.now(),
): PublicGarden {
  hitOrThrow(`garden-create:${userId}`, 20, 60 * 60 * 1000, now);
  const relationship = requireActiveRelationship(userId);
  ensurePrimaryGarden(relationship.id, userId, now);
  const input = z
    .object({
      name: nameSchema,
      description: descriptionSchema,
      theme: z.string().default("meadow"),
    })
    .strict()
    .parse(body);
  if (!isGardenTheme(input.theme)) {
    throw new AppError("INVALID_INPUT", "Choose a garden theme that Bloom knows.", 400, {
      theme: "Choose a theme from the list.",
    });
  }
  const count = one<{ count: number }>(
    `SELECT COUNT(*) AS count FROM gardens WHERE relationship_id = ? AND archived_at IS NULL`,
    relationship.id,
  );
  if (Number(count?.count ?? 0) >= MAX_GARDENS_PER_RELATIONSHIP) {
    throw new AppError("GARDEN_LIMIT", "Twelve gardens is plenty for now.", 409);
  }
  const id = newId();
  run(
    `INSERT INTO gardens (id, relationship_id, name, description, theme, is_primary, created_by, created_at, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL)`,
    id,
    relationship.id,
    input.name,
    input.description,
    input.theme,
    userId,
    now,
    now,
  );
  return getGarden(userId, id);
}

export function updateGarden(userId: string, gardenId: string, body: unknown, now = Date.now()): PublicGarden {
  requireGardenAccess(userId, gardenId);
  const input = z
    .object({
      name: nameSchema.optional(),
      description: descriptionSchema.optional(),
      theme: z.string().optional(),
      expectedUpdatedAt: z.number().int(),
    })
    .strict()
    .parse(body);
  if (input.theme !== undefined && !isGardenTheme(input.theme)) {
    throw new AppError("INVALID_INPUT", "Choose a garden theme that Bloom knows.", 400, {
      theme: "Choose a theme from the list.",
    });
  }
  transaction(() => {
    const locked = one<{ updated_at: number; archived_at: number | null }>(
      "SELECT updated_at, archived_at FROM gardens WHERE id = ?",
      gardenId,
    );
    if (!locked || locked.archived_at) throw new AppError("NOT_FOUND", "This garden isn't here.", 404);
    if (locked.updated_at !== input.expectedUpdatedAt) {
      throw new AppError("STALE", "This garden changed somewhere else. Look again, then retry.", 409);
    }
    const current = one<GardenRow>("SELECT * FROM gardens WHERE id = ?", gardenId)!;
    run(
      `UPDATE gardens SET name = ?, description = ?, theme = ?, updated_at = ? WHERE id = ?`,
      input.name ?? current.name,
      input.description ?? current.description,
      input.theme ?? current.theme,
      now,
      gardenId,
    );
  });
  return getGarden(userId, gardenId);
}

export function archiveGarden(userId: string, gardenId: string, now = Date.now()): { ok: true } {
  const garden = requireGardenAccess(userId, gardenId);
  if (garden.is_primary) {
    throw new AppError("PRIMARY_GARDEN", "Your first garden stays. Empty it if you like, but keep the ground.", 409);
  }
  const flowers = one<{ count: number }>(
    `SELECT COUNT(*) AS count FROM garden_flowers WHERE garden_id = ? AND removed_at IS NULL`,
    gardenId,
  );
  if (Number(flowers?.count ?? 0) > 0) {
    throw new AppError(
      "GARDEN_NOT_EMPTY",
      "Move or remove the flowers first. Years of small things shouldn't vanish by accident.",
      409,
    );
  }
  run(`UPDATE gardens SET archived_at = ?, updated_at = ?, is_primary = 0 WHERE id = ? AND archived_at IS NULL`, now, now, gardenId);
  return { ok: true };
}

export function plantFlowerFromPetal(
  userId: string,
  input: { gardenId: string; petalId: string; idempotencyKey: string },
  now = Date.now(),
): PublicGardenFlower {
  hitOrThrow(`plant:${userId}`, 60, 60 * 60 * 1000, now);
  const relationship = requireActiveRelationship(userId);
  requireGardenAccess(userId, input.gardenId);
  let createdId = "";
  try {
    transaction(() => {
      const petal = one<{
        id: string;
        relationship_id: string;
        sender_id: string;
        recipient_id: string;
        type: string;
        content_json: string;
        status: string;
        deleted_at: number | null;
      }>("SELECT * FROM petals WHERE id = ?", input.petalId);
      if (
        !petal ||
        petal.deleted_at ||
        petal.relationship_id !== relationship.id ||
        petal.type !== "flower" ||
        petal.status !== "opened"
      ) {
        throw new AppError("NOT_FOUND", "This flower isn't ready to plant.", 404);
      }
      if (petal.recipient_id !== userId) {
        throw new AppError("NOT_YOURS", "Only the person who received it can plant it.", 403);
      }
      const existing = one<{ id: string; garden_id: string }>(
        `SELECT id, garden_id FROM garden_flowers WHERE petal_id = ? AND removed_at IS NULL`,
        input.petalId,
      );
      if (existing) {
        createdId = existing.id;
        return;
      }
      const count = one<{ count: number }>(
        `SELECT COUNT(*) AS count FROM garden_flowers WHERE garden_id = ? AND removed_at IS NULL`,
        input.gardenId,
      );
      if (Number(count?.count ?? 0) >= MAX_FLOWERS_PER_GARDEN) {
        throw new AppError("GARDEN_FULL", "This garden is full. Start another, or make a little room.", 409);
      }
      let content: FlowerContent;
      try {
        content = JSON.parse(petal.content_json) as FlowerContent;
      } catch {
        throw new AppError("INVALID_MEDIA", "This flower couldn't be read.", 400);
      }
      const flowerKey = normalizeFlowerKey(content.variety);
      const spots = many<{ x: number; y: number }>(
        `SELECT x, y FROM garden_flowers WHERE garden_id = ? AND removed_at IS NULL`,
        input.gardenId,
      );
      const place = placeInGarden(spots, input.petalId + input.idempotencyKey);
      createdId = newId();
      run(
        `INSERT INTO garden_flowers (
          id, garden_id, relationship_id, flower_key, style, asset_kind, asset_ref, petal_id,
          given_by, planted_by, message, x, y, z, scale, rotation, planted_at, removed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'builtin', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        createdId,
        input.gardenId,
        relationship.id,
        flowerKey,
        defaultStyleFor(flowerKey),
        input.petalId,
        petal.sender_id,
        userId,
        (content.note ?? "").slice(0, 500),
        place.x,
        place.y,
        place.z,
        place.scale,
        place.rotation,
        now,
        now,
        now,
      );
      run(`UPDATE gardens SET updated_at = ? WHERE id = ?`, now, input.gardenId);
      run(`UPDATE garden_elements SET stage = 'bloom', bloomed_at = ? WHERE petal_id = ? AND stage = 'bud'`, now, input.petalId);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = one<{ id: string }>(
        `SELECT id FROM garden_flowers WHERE petal_id = ? AND removed_at IS NULL`,
        input.petalId,
      );
      if (again) createdId = again.id;
      else throw error;
    } else {
      throw error;
    }
  }
  const flower = flowerById(createdId);
  if (!flower) throw new AppError("INTERNAL", "Something went wrong. Please try again.", 500);
  return flower;
}

export function moveFlower(
  userId: string,
  flowerId: string,
  body: unknown,
  now = Date.now(),
): PublicGardenFlower {
  const input = z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      scale: z.number().min(0.5).max(1.6).optional(),
      rotation: z.number().min(-45).max(45).optional(),
      expectedUpdatedAt: z.number().int(),
    })
    .strict()
    .parse(body);
  transaction(() => {
    const row = one<FlowerRow>(`${flowerSelect()} WHERE f.id = ? AND f.removed_at IS NULL`, flowerId);
    if (!row) throw new AppError("NOT_FOUND", "That flower isn't here.", 404);
    requireGardenAccess(userId, row.garden_id);
    if (row.updated_at !== input.expectedUpdatedAt) {
      throw new AppError("STALE", "That flower moved somewhere else. Look again, then retry.", 409);
    }
    run(
      `UPDATE garden_flowers SET x = ?, y = ?, z = ?, scale = ?, rotation = ?, updated_at = ?
       WHERE id = ? AND removed_at IS NULL AND updated_at = ?`,
      input.x,
      input.y,
      Math.floor(input.y * 1000),
      input.scale ?? row.scale,
      input.rotation ?? row.rotation,
      now,
      flowerId,
      input.expectedUpdatedAt,
    );
    run(`UPDATE gardens SET updated_at = ? WHERE id = ?`, now, row.garden_id);
  });
  const flower = flowerById(flowerId);
  if (!flower) throw new AppError("NOT_FOUND", "That flower isn't here.", 404);
  return flower;
}

export function removeFlowerFromGarden(userId: string, flowerId: string, now = Date.now()): { ok: true } {
  transaction(() => {
    const row = one<FlowerRow>(`${flowerSelect()} WHERE f.id = ? AND f.removed_at IS NULL`, flowerId);
    if (!row) throw new AppError("NOT_FOUND", "That flower isn't here.", 404);
    requireGardenAccess(userId, row.garden_id);
    run(`UPDATE garden_flowers SET removed_at = ?, updated_at = ? WHERE id = ? AND removed_at IS NULL`, now, now, flowerId);
    run(`UPDATE gardens SET updated_at = ? WHERE id = ?`, now, row.garden_id);
  });
  return { ok: true };
}

export function plantedGardenIdForPetal(petalId: string): string | null {
  const row = one<{ garden_id: string }>(
    `SELECT garden_id FROM garden_flowers WHERE petal_id = ? AND removed_at IS NULL`,
    petalId,
  );
  return row?.garden_id ?? null;
}

export function primaryGardenPreview(relationshipId: string, limit = 48): PublicGardenFlower[] {
  const garden = one<GardenRow>(
    `SELECT * FROM gardens WHERE relationship_id = ? AND is_primary = 1 AND archived_at IS NULL`,
    relationshipId,
  );
  if (!garden) return [];
  return many<FlowerRow>(
    `${flowerSelect()} WHERE f.garden_id = ? AND f.removed_at IS NULL ORDER BY f.planted_at ASC LIMIT ?`,
    garden.id,
    limit,
  ).map(toPublicFlower);
}

function requireGardenAccess(userId: string, gardenId: string): GardenRow {
  const relationship = requireActiveRelationship(userId);
  const garden = one<GardenRow>(
    `SELECT * FROM gardens WHERE id = ? AND relationship_id = ? AND archived_at IS NULL`,
    gardenId,
    relationship.id,
  );
  if (!garden) throw new AppError("NOT_FOUND", "This garden isn't here.", 404);
  return garden;
}

function flowerById(id: string): PublicGardenFlower | null {
  const row = one<FlowerRow>(`${flowerSelect()} WHERE f.id = ?`, id);
  return row && !row.removed_at ? toPublicFlower(row) : null;
}

function flowerSelect(): string {
  return `SELECT f.*,
      gu.display_name AS given_name, gu.deleted_at AS given_deleted,
      pu.display_name AS planted_name, pu.deleted_at AS planted_deleted
    FROM garden_flowers f
    JOIN users gu ON gu.id = f.given_by
    JOIN users pu ON pu.id = f.planted_by`;
}

function toPublicGarden(row: GardenRow): PublicGarden {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    theme: (isGardenTheme(row.theme) ? row.theme : "meadow") as GardenTheme,
    isPrimary: Boolean(row.is_primary),
    flowerCount: Number(row.flower_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicFlower(row: FlowerRow): PublicGardenFlower {
  const style = isFlowerStyle(row.style) ? row.style : defaultStyleFor(row.flower_key);
  return {
    id: row.id,
    gardenId: row.garden_id,
    flowerKey: isFlowerKey(row.flower_key) ? row.flower_key : "ranunculus",
    style,
    assetKind: row.asset_kind,
    assetRef: row.asset_ref,
    petalId: row.petal_id,
    givenBy: row.given_by,
    givenByName: row.given_deleted ? "Someone" : row.given_name || "Someone",
    plantedBy: row.planted_by,
    plantedByName: row.planted_deleted ? "Someone" : row.planted_name || "Someone",
    message: row.message,
    x: row.x,
    y: row.y,
    z: row.z,
    scale: row.scale,
    rotation: row.rotation,
    plantedAt: row.planted_at,
    updatedAt: row.updated_at,
  };
}

function encodeCursor(plantedAt: number, id: string): string {
  return Buffer.from(`${plantedAt}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string | null): { plantedAt: number; id: string } {
  if (!cursor) return { plantedAt: 0, id: "00000000-0000-4000-8000-000000000000" };
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const [raw, id] = decoded.split("|");
    const plantedAt = Number(raw);
    if (!Number.isFinite(plantedAt) || !id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad");
    return { plantedAt, id };
  } catch {
    throw new AppError("INVALID_INPUT", "That page could not be read.", 400);
  }
}

export { GARDEN_THEMES };
