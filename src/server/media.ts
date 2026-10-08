import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { newId } from "./crypto";
import { mediaDir, one, run, transaction } from "./db";
import { AppError } from "./errors";
import { hitOrThrow } from "./rate-limit";
import { getRelationship } from "./relationship";

export type MediaKind = "image" | "audio";

export interface DetectedMedia {
  kind: MediaKind;
  mime: string;
  ext: "jpg" | "png" | "gif" | "webp" | "mp3" | "wav" | "ogg" | "m4a";
}

const IMAGE_MAX = 8 * 1024 * 1024;
const AUDIO_MAX = 12 * 1024 * 1024;
const MAX_SIDE = 12_000;
const MAX_PIXELS = 40_000_000;

export function detectMedia(buf: Buffer): DetectedMedia | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { kind: "image", mime: "image/png", ext: "png" };
  }
  const head6 = buf.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return { kind: "image", mime: "image/gif", ext: "gif" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { kind: "image", mime: "image/webp", ext: "webp" };
  }
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") {
    return { kind: "audio", mime: "audio/wav", ext: "wav" };
  }
  if (buf.subarray(0, 4).toString("ascii") === "OggS") return { kind: "audio", mime: "audio/ogg", ext: "ogg" };
  if (buf.subarray(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { kind: "audio", mime: "audio/mpeg", ext: "mp3" };
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "M4A " || brand === "M4B ") return { kind: "audio", mime: "audio/mp4", ext: "m4a" };
  }
  return null;
}

export function assertSafeDimensions(buf: Buffer, detected: DetectedMedia): void {
  if (detected.mime === "image/png") {
    if (buf.length < 24) throw new AppError("INVALID_MEDIA", "That file can't be kept.", 400);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    rejectHuge(width, height);
  }
  if (detected.mime === "image/jpeg") {
    const size = jpegSize(buf);
    if (size) rejectHuge(size.w, size.h);
  }
}

function rejectHuge(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new AppError("INVALID_MEDIA", "That picture is too large to keep.", 400);
  }
}

function jpegSize(buf: Buffer): { w: number; h: number } | null {
  let offset = 2;
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

export interface MediaRow {
  id: string;
  owner_id: string;
  relationship_id: string;
  storage_key: string;
  detected_type: string;
  kind: MediaKind;
  byte_size: number;
  sha256: string;
  created_at: number;
  deleted_at: number | null;
}

export async function saveMedia(input: { userId: string; bytes: Buffer; now?: number }): Promise<{ id: string; kind: MediaKind; mime: string }> {
  const now = input.now ?? Date.now();
  hitOrThrow(`media:${input.userId}`, 30, 60 * 60 * 1000, now);
  const relationship = getRelationship(input.userId);
  if (!relationship || relationship.status !== "active") {
    throw new AppError("NO_RELATIONSHIP", "This stays empty until it's just the two of you.", 409);
  }
  const detected = detectMedia(input.bytes);
  if (!detected) {
    throw new AppError(
      "INVALID_MEDIA",
      "That file can't be kept. Use a photo (JPG, PNG, WEBP, GIF) or a short audio clip.",
      400,
    );
  }
  const limit = detected.kind === "image" ? IMAGE_MAX : AUDIO_MAX;
  if (input.bytes.length > limit) {
    throw new AppError("INVALID_MEDIA", "That file is too heavy to keep.", 400);
  }
  assertSafeDimensions(input.bytes, detected);
  const id = newId();
  const storageKey = `${id}.${detected.ext}`;
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const fullPath = safeMediaPath(storageKey);
  transaction(() => {
    run(
      `INSERT INTO media (id, owner_id, relationship_id, storage_key, detected_type, kind, byte_size, sha256, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      id,
      input.userId,
      relationship.id,
      storageKey,
      detected.mime,
      detected.kind,
      input.bytes.length,
      hash,
      now,
    );
  });
  try {
    fs.writeFileSync(fullPath, input.bytes, { flag: "wx" });
  } catch (error) {
    run("DELETE FROM media WHERE id = ?", id);
    throw error;
  }
  return { id, kind: detected.kind, mime: detected.mime };
}

export function getAuthorizedMedia(userId: string, mediaId: string): MediaRow {
  const row = one<MediaRow>(
    `SELECT m.* FROM media m
     JOIN relationship_members mem ON mem.relationship_id = m.relationship_id AND mem.user_id = ? AND mem.left_at IS NULL
     JOIN relationships r ON r.id = m.relationship_id AND r.status = 'active'
     WHERE m.id = ? AND m.deleted_at IS NULL`,
    userId,
    mediaId,
  );
  if (!row) throw new AppError("NOT_FOUND", "That file is not here.", 404);
  return row;
}

export function assertMediaUsable(input: {
  userId: string;
  relationshipId: string;
  mediaId: string;
  kind: MediaKind;
}): void {
  const row = one<MediaRow>("SELECT * FROM media WHERE id = ? AND deleted_at IS NULL", input.mediaId);
  if (!row || row.owner_id !== input.userId || row.relationship_id !== input.relationshipId || row.kind !== input.kind) {
    throw new AppError("INVALID_MEDIA", "That file can't be used here.", 400);
  }
}

export function safeMediaPath(storageKey: string): string {
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp|mp3|wav|ogg|m4a)$/i.test(storageKey)) {
    throw new AppError("NOT_FOUND", "That file is not here.", 404);
  }
  const root = path.resolve(mediaDir());
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep)) throw new AppError("NOT_FOUND", "That file is not here.", 404);
  return full;
}

export function readMediaFile(row: MediaRow): Buffer {
  const full = safeMediaPath(row.storage_key);
  if (!fs.existsSync(full)) throw new AppError("NOT_FOUND", "That file is not here.", 404);
  return fs.readFileSync(full);
}
