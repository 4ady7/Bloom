import { describe, expect, it } from "vitest";
import { detectMedia, assertSafeDimensions, safeMediaPath } from "@/server/media";
import { createUser, pairUsers, randomUUID } from "./helpers";

describe("media", () => {
  it("trusts file bytes instead of the claimed type", () => {
    expect(detectMedia(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectMedia(jpeg)?.mime).toBe("image/jpeg");
    const png = Buffer.alloc(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.writeUInt32BE(90000, 16);
    png.writeUInt32BE(90000, 20);
    expect(detectMedia(png)?.mime).toBe("image/png");
    expect(() => assertSafeDimensions(png, detectMedia(png)!)).toThrow(/too large/);
  });

  it("refuses a storage key that tries to leave the media directory", () => {
    expect(() => safeMediaPath("../secrets.txt")).toThrow(/not here/);
    expect(() => safeMediaPath(`${randomUUID()}.jpg`)).not.toThrow();
  });

  it("keeps an upload inside the relationship", async () => {
    const { saveMedia, getAuthorizedMedia } = await import("@/server/media");
    const { ada, bea } = await pairUsers();
    const outsider = await createUser("Cy");
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
    const saved = await saveMedia({ userId: ada.user.id, bytes: jpeg });
    expect(getAuthorizedMedia(bea.user.id, saved.id).id).toBe(saved.id);
    expect(() => getAuthorizedMedia(outsider.user.id, saved.id)).toThrow(/not here/);
    await expect(saveMedia({ userId: ada.user.id, bytes: Buffer.from("not a photo") })).rejects.toThrow(/can't be kept/);
  });
});

describe("http boundaries", () => {
  it("rejects a cross-origin mutation and an unknown petal id", async () => {
    const { POST } = await import("@/app/api/petals/route");
    const { GET } = await import("@/app/api/petals/[id]/route");
    const { pairUsers, noteBody, randomUUID } = await import("./helpers");
    const { createPetal } = await import("@/server/petals");
    const { ada } = await pairUsers();
    const sent = await createPetal(ada.user.id, randomUUID(), noteBody("secret"));
    const outsider = await (await import("@/server/auth")).signUp({
      email: `cy.${randomUUID()}@example.com`,
      password: "correct-horse",
      displayName: "Cy",
      timezone: "UTC",
    });

    const forged = await POST(
      new Request("http://localhost/api/petals", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          host: "localhost",
          cookie: `bloom_session=${ada.token}`,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify(noteBody("stolen")),
      }),
    );
    expect(forged.status).toBe(403);

    const peek = await GET(
      new Request("http://localhost/api/petals/" + sent.petal.id, {
        headers: { cookie: `bloom_session=${outsider.token}`, host: "localhost" },
      }),
      { params: Promise.resolve({ id: sent.petal.id }) },
    );
    expect(peek.status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("stops a run of failed sign-ins", async () => {
    const { signIn } = await import("@/server/auth");
    const user = await createUser("Ada");
    process.env.BLOOM_RATE_LIMIT = "on";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(() => signIn({ email: user.user.email, password: "not-the-password", ip: "rate-test" })).toThrow(/did not match/);
    }
    expect(() => signIn({ email: user.user.email, password: "correct-horse", ip: "rate-test" })).toThrow(/Too many/);
  });
});

describe("push queue", () => {
  it("retries a failed push and does not send a deleted petal", async () => {
    const { createPetal, deletePetal } = await import("@/server/petals");
    const { processPushQueue, setPushSenderForTests } = await import("@/server/push");
    const { many, run } = await import("@/server/db");
    const { ada, bea } = await pairUsers();
    process.env.VAPID_PUBLIC_KEY = "test-public";
    process.env.VAPID_PRIVATE_KEY = "test-private";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("offline"), { statusCode: 503 });
    });
    run(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, user_agent)
       VALUES (?, ?, 'https://push.example/one', 'key', 'auth', ?, NULL)`,
      randomUUID(),
      bea.user.id,
      Date.now(),
    );
    const sent = await createPetal(ada.user.id, randomUUID(), {
      type: "note",
      content: { text: "ping" },
      schedule: null,
      expiresInDays: null,
      random: false,
    });
    const pending = many<{ status: string; attempt_count: number }>(
      "SELECT status, attempt_count FROM notifications WHERE petal_id = ? AND channel = 'web_push'",
      sent.petal.id,
    );
    expect(pending[0].status).toBe("pending");
    expect(attempts).toBe(1);
    await processPushQueue(Date.now() + 2 * 60 * 1000);
    const after = many<{ status: string }>(
      "SELECT status FROM notifications WHERE petal_id = ? AND channel = 'web_push'",
      sent.petal.id,
    );
    expect(after[0].status).toBe("sent");

    setPushSenderForTests(async () => {
      throw new Error("should not send");
    });
    const removable = await createPetal(ada.user.id, randomUUID(), {
      type: "note",
      content: { text: "gone" },
      schedule: null,
      expiresInDays: null,
      random: false,
    });
    many("SELECT 1");
    run(
      `UPDATE notifications SET status = 'pending', next_attempt_at = ? WHERE petal_id = ? AND channel = 'web_push'`,
      Date.now() - 1000,
      removable.petal.id,
    );
    deletePetal(ada.user.id, removable.petal.id);
    await processPushQueue(Date.now() + 1000);
    const skipped = many<{ status: string }>(
      "SELECT status FROM notifications WHERE petal_id = ? AND channel = 'web_push'",
      removable.petal.id,
    );
    expect(skipped[0].status).toBe("skipped");
    setPushSenderForTests(null);
  });
});
