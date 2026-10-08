import { createRequire } from "node:module";
import path from "node:path";
import { many, run } from "./db";

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export type PushSender = (subscription: PushSubscriptionRow, payload: PushPayload) => Promise<void>;

let senderOverride: PushSender | null = null;

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export function pushPublicKey(): string | null {
  return pushConfigured() ? process.env.VAPID_PUBLIC_KEY || null : null;
}

const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
  "wns.windows.com",
];

export function isPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function setPushSenderForTests(sender: PushSender | null): void {
  senderOverride = sender;
}

interface PendingPush {
  id: string;
  user_id: string;
  petal_id: string | null;
  attempt_count: number;
  title: string;
  body: string;
}

const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
const SEND_LEASE_MS = 60_000;

export async function processPushQueue(now = Date.now()): Promise<void> {
  if (!pushConfigured() && !senderOverride) return;
  run(
    `UPDATE notifications SET status = 'pending'
     WHERE channel = 'web_push' AND status = 'sending'
     AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    now,
  );
  const pending = many<PendingPush>(
    `SELECT id, user_id, petal_id, attempt_count, title, body
     FROM notifications
     WHERE channel = 'web_push' AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC LIMIT 20`,
    now,
  );
  for (const item of pending) {
    const claimed = run(
      `UPDATE notifications SET status = 'sending', attempt_count = attempt_count + 1, next_attempt_at = ?
       WHERE id = ? AND status = 'pending'`,
      now + SEND_LEASE_MS,
      item.id,
    );
    if (claimed.changes !== 1) continue;
    const petal = item.petal_id
      ? (many<{ status: string; deleted_at: number | null }>(
          "SELECT status, deleted_at FROM petals WHERE id = ?",
          item.petal_id,
        )[0] ?? null)
      : null;
    if (!petal || petal.deleted_at || petal.status === "cancelled" || petal.status === "expired" || petal.status === "scheduled") {
      run(`UPDATE notifications SET status = 'skipped', last_error = 'content_unavailable' WHERE id = ?`, item.id);
      continue;
    }
    const subscriptions = many<PushSubscriptionRow>(
      "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
      item.user_id,
    );
    if (subscriptions.length === 0) {
      run(`UPDATE notifications SET status = 'skipped', last_error = 'no_subscription' WHERE id = ?`, item.id);
      continue;
    }
    let failed: unknown = null;
    for (const subscription of subscriptions) {
      try {
        await sendOne(subscription, { title: item.title, body: item.body, url: "/" });
      } catch (error) {
        const status = statusCode(error);
        if (status === 404 || status === 410) {
          run("DELETE FROM push_subscriptions WHERE id = ?", subscription.id);
        } else {
          failed = error;
        }
      }
    }
    if (failed) {
      const attempts = item.attempt_count + 1;
      if (attempts >= 5) {
        run(
          `UPDATE notifications SET status = 'failed', last_error = ? WHERE id = ?`,
          safeError(failed),
          item.id,
        );
      } else {
        const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
        run(
          `UPDATE notifications SET status = 'pending', next_attempt_at = ?, last_error = ? WHERE id = ?`,
          now + delay,
          safeError(failed),
          item.id,
        );
      }
    } else {
      run(`UPDATE notifications SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?`, now, item.id);
    }
  }
}

async function sendOne(subscription: PushSubscriptionRow, payload: PushPayload): Promise<void> {
  if (senderOverride) {
    await senderOverride(subscription, payload);
    return;
  }
  if (!pushConfigured()) {
    throw Object.assign(new Error("push_not_configured"), { statusCode: 503 });
  }
  const webpush = loadWebPush();
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    { TTL: 60 * 60 * 12, timeout: 5000 },
  );
}

function loadWebPush(): {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { TTL: number; timeout: number },
  ) => Promise<unknown>;
} {
  // Call createRequire indirectly so the bundler does not try to resolve web-push
  // (and its Node-only imports) while compiling server components.
  const create = createRequire;
  const root = path.join(process.cwd(), "package.json");
  const load = create(root) as (id: string) => ReturnType<typeof loadWebPush>;
  return load("web-push");
}

function statusCode(error: unknown): number | null {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode?: number }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}

function safeError(error: unknown): string {
  const code = statusCode(error);
  if (code) return `push_${code}`;
  return "push_failed";
}

export function saveSubscription(input: {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  now: number;
}): void {
  run(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    input.id,
    input.userId,
    input.endpoint,
    input.p256dh,
    input.auth,
    input.now,
    input.userAgent,
  );
}

export function removeSubscription(userId: string, endpoint: string): void {
  run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userId, endpoint);
}
