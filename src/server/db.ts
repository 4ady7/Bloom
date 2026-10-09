import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | null = null;

export function dataDir(): string {
  return path.resolve(process.env.BLOOM_DATA_DIR || path.join(process.cwd(), ".data"));
}

export function mediaDir(): string {
  return path.join(dataDir(), "media");
}

export function getDb(): DatabaseSync {
  if (database) return database;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(mediaDir(), { recursive: true });
  const db = new DatabaseSync(path.join(dir, "bloom.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  database = db;
  return db;
}

export function resetConnection(): void {
  if (database) {
    database.close();
    database = null;
  }
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

type SqlValue = string | number | bigint | null | Uint8Array;

export function one<T>(sql: string, ...params: SqlValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function many<T>(sql: string, ...params: SqlValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SqlValue[]): { changes: number } {
  const result = getDb().prepare(sql).run(...params);
  return { changes: Number(result.changes) };
}

const SCHEMA_V1 = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX users_email_active ON users(email) WHERE deleted_at IS NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'dissolved')),
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  dissolved_at INTEGER
);

CREATE TABLE relationship_members (
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (relationship_id, user_id)
);
CREATE UNIQUE INDEX one_active_membership ON relationship_members(user_id) WHERE left_at IS NULL;
CREATE INDEX members_relationship ON relationship_members(relationship_id);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users(id),
  used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX invites_relationship ON invites(relationship_id);

CREATE TABLE petals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'sealed', 'opened', 'cancelled', 'expired')),
  sender_timezone TEXT NOT NULL,
  scheduled_for INTEGER,
  opened_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX petals_idempotency ON petals(sender_id, idempotency_key);
CREATE INDEX petals_recipient ON petals(recipient_id, status, created_at);
CREATE INDEX petals_relationship_created ON petals(relationship_id, created_at);
CREATE INDEX petals_due ON petals(status, scheduled_for);

CREATE TABLE petal_responses (
  id TEXT PRIMARY KEY,
  petal_id TEXT NOT NULL UNIQUE REFERENCES petals(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE (author_id, idempotency_key)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  petal_id TEXT REFERENCES petals(id),
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  read_at INTEGER
);
CREATE INDEX notifications_user ON notifications(user_id, created_at);
CREATE INDEX notifications_pending ON notifications(status, next_attempt_at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX push_user ON push_subscriptions(user_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  storage_key TEXT NOT NULL UNIQUE,
  detected_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX media_owner ON media(owner_id);

CREATE TABLE garden_elements (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  petal_id TEXT NOT NULL UNIQUE REFERENCES petals(id),
  kind TEXT NOT NULL,
  variant TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('bud', 'bloom', 'withered')),
  created_at INTEGER NOT NULL,
  bloomed_at INTEGER
);
CREATE INDEX garden_relationship ON garden_elements(relationship_id, created_at);

CREATE TABLE rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
`;

const SCHEMA_V2 = `
CREATE TABLE gardens (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX gardens_relationship ON gardens(relationship_id, created_at);
CREATE UNIQUE INDEX gardens_one_primary ON gardens(relationship_id) WHERE is_primary = 1 AND archived_at IS NULL;

CREATE TABLE garden_flowers (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id),
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  flower_key TEXT NOT NULL,
  style TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('builtin', 'generated')),
  asset_ref TEXT,
  petal_id TEXT REFERENCES petals(id),
  given_by TEXT NOT NULL REFERENCES users(id),
  planted_by TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL,
  y REAL NOT NULL,
  z INTEGER NOT NULL DEFAULT 0,
  scale REAL NOT NULL DEFAULT 1,
  rotation REAL NOT NULL DEFAULT 0,
  planted_at INTEGER NOT NULL,
  removed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX garden_flowers_garden ON garden_flowers(garden_id, planted_at);
CREATE UNIQUE INDEX garden_flowers_petal ON garden_flowers(petal_id) WHERE petal_id IS NOT NULL AND removed_at IS NULL;
`;

function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const current = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  const version = current?.v ?? 0;
  if (version < 1) {
    db.exec("BEGIN");
    try {
      db.exec(SCHEMA_V1);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(Date.now());
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    }
  }
  const after = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  if ((after?.v ?? 0) < 2) {
    db.exec("BEGIN");
    try {
      db.exec(SCHEMA_V2);
      migrateGardensFromElements(db);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (2, ?)").run(Date.now());
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    }
  }
}

function migrateGardensFromElements(db: DatabaseSync): void {
  const relationships = db.prepare("SELECT id FROM relationships WHERE status = 'active'").all() as { id: string }[];
  const now = Date.now();
  for (const relationship of relationships) {
    const existing = db
      .prepare("SELECT id FROM gardens WHERE relationship_id = ? AND archived_at IS NULL LIMIT 1")
      .get(relationship.id) as { id: string } | undefined;
    let gardenId = existing?.id;
    if (!gardenId) {
      const creator = db
        .prepare(
          `SELECT user_id FROM relationship_members WHERE relationship_id = ? AND left_at IS NULL ORDER BY joined_at ASC LIMIT 1`,
        )
        .get(relationship.id) as { user_id: string } | undefined;
      if (!creator) continue;
      gardenId = cryptoRandomId();
      db.prepare(
        `INSERT INTO gardens (id, relationship_id, name, description, theme, is_primary, created_by, created_at, updated_at, archived_at)
         VALUES (?, ?, 'Our Garden', '', 'meadow', 1, ?, ?, ?, NULL)`,
      ).run(gardenId, relationship.id, creator.user_id, now, now);
    }
    const flowers = db
      .prepare(
        `SELECT g.id, g.petal_id, g.variant, g.created_at, g.bloomed_at, p.sender_id, p.content_json
         FROM garden_elements g
         JOIN petals p ON p.id = g.petal_id
         WHERE g.relationship_id = ? AND g.kind = 'flower'`,
      )
      .all(relationship.id) as {
      id: string;
      petal_id: string;
      variant: string;
      created_at: number;
      bloomed_at: number | null;
      sender_id: string;
      content_json: string;
    }[];
    for (const [index, flower] of flowers.entries()) {
      const already = db
        .prepare("SELECT id FROM garden_flowers WHERE petal_id = ? AND removed_at IS NULL")
        .get(flower.petal_id) as { id: string } | undefined;
      if (already) continue;
      let message = "";
      try {
        const content = JSON.parse(flower.content_json) as { note?: string };
        message = typeof content.note === "string" ? content.note.slice(0, 500) : "";
      } catch {
        message = "";
      }
      const hash = hashString(flower.petal_id);
      const x = 0.1 + ((hash % 800) / 1000);
      const y = 0.45 + (((hash >>> 8) % 450) / 1000);
      db.prepare(
        `INSERT INTO garden_flowers (
          id, garden_id, relationship_id, flower_key, style, asset_kind, asset_ref, petal_id,
          given_by, planted_by, message, x, y, z, scale, rotation, planted_at, removed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'illustrated', 'builtin', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).run(
        cryptoRandomId(),
        gardenId,
        relationship.id,
        flower.variant || "ranunculus",
        flower.petal_id,
        flower.sender_id,
        flower.sender_id,
        message,
        x,
        y,
        Math.floor(y * 1000) + index,
        0.85 + ((hash % 30) / 100),
        ((hash % 24) - 12),
        flower.bloomed_at ?? flower.created_at,
        flower.created_at,
        flower.created_at,
      );
    }
  }
}

function cryptoRandomId(): string {
  return randomUUID();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return Math.abs(hash);
}
