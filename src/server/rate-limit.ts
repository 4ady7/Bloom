import { getDb, transaction } from "./db";
import { AppError } from "./errors";

export function assertNotLimited(key: string, limit: number, windowMs: number, now = Date.now()): void {
  if (process.env.BLOOM_RATE_LIMIT === "off") return;
  const row = getDb()
    .prepare("SELECT window_start, count FROM rate_limits WHERE bucket_key = ?")
    .get(key) as { window_start: number; count: number } | undefined;
  if (!row) return;
  if (now - row.window_start >= windowMs) return;
  if (row.count >= limit) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Wait a little, then try again.", 429);
  }
}

export function recordHit(key: string, windowMs: number, now = Date.now()): void {
  if (process.env.BLOOM_RATE_LIMIT === "off") return;
  transaction(() => {
    const row = getDb()
      .prepare("SELECT window_start, count FROM rate_limits WHERE bucket_key = ?")
      .get(key) as { window_start: number; count: number } | undefined;
    if (!row || now - row.window_start >= windowMs) {
      getDb()
        .prepare(
          `INSERT INTO rate_limits(bucket_key, window_start, count) VALUES (?, ?, 1)
           ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
        )
        .run(key, now);
      return;
    }
    getDb().prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket_key = ?").run(key);
  });
}

export function hitOrThrow(key: string, limit: number, windowMs: number, now = Date.now()): void {
  assertNotLimited(key, limit, windowMs, now);
  recordHit(key, windowMs, now);
}
