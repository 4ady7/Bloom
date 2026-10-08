import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach } from "vitest";

let directory = "";

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "bloom-"));
  process.env.BLOOM_DATA_DIR = directory;
  process.env.BLOOM_RATE_LIMIT = "off";
  process.env.BLOOM_SCHEDULER = "off";
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  const db = await import("@/server/db");
  db.resetConnection();
});

afterEach(async () => {
  const db = await import("@/server/db");
  db.resetConnection();
  rmSync(directory, { recursive: true, force: true });
});

export async function createUser(name: string, timezone = "Europe/London") {
  const { signUp } = await import("@/server/auth");
  const stamp = randomUUID();
  return signUp({
    email: `${name}.${stamp}@example.com`,
    password: "correct-horse",
    displayName: name,
    timezone,
    ip: stamp,
  });
}

export async function pairUsers() {
  const { createInvite, joinWithCode } = await import("@/server/relationship");
  const ada = await createUser("Ada", "Europe/London");
  const bea = await createUser("Bea", "America/New_York");
  const invite = createInvite(ada.user.id);
  joinWithCode(bea.user.id, invite.code);
  return { ada, bea, invite };
}

export function noteBody(text = "Thinking of you.") {
  return {
    type: "note" as const,
    content: { text },
    schedule: null,
    expiresInDays: null,
    random: false,
  };
}

export { randomUUID };
