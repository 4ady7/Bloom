import { describe, expect, it } from "vitest";
import { createUser, noteBody, pairUsers, randomUUID } from "./helpers";

describe("authentication", () => {
  it("creates a session and rejects a wrong password without confirming the email", async () => {
    const { signIn, userFromToken, signOut } = await import("@/server/auth");
    const created = await createUser("Ada");
    const user = userFromToken(created.token);
    expect(user?.displayName).toBe("Ada");
    expect(() => signIn({ email: created.user.email, password: "wrong-password-here" })).toThrow(/did not match/);
    signOut(created.token);
    expect(userFromToken(created.token)).toBeNull();
  });

  it("expires a session after the idle window and after the absolute window", async () => {
    const { userFromToken } = await import("@/server/auth");
    const created = await createUser("Ada");
    const idle = userFromToken(created.token, Date.now() + 15 * 24 * 60 * 60 * 1000);
    expect(idle).toBeNull();
    const again = await createUser("Bea");
    expect(userFromToken(again.token, Date.now() + 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("refuses a second account with the same email", async () => {
    const { signUp } = await import("@/server/auth");
    const created = await createUser("Ada");
    expect(() =>
      signUp({
        email: created.user.email.toUpperCase(),
        password: "correct-horse",
        displayName: "Someone",
        timezone: "UTC",
      }),
    ).toThrow(/already exists/);
  });

  it("stores a script-looking name as text and keeps signing in", async () => {
    const { signUp, signIn } = await import("@/server/auth");
    const created = signUp({
      email: `ada.${randomUUID()}@example.com`,
      password: "correct-horse",
      displayName: "<script>alert(1)</script>",
      timezone: "UTC",
    });
    expect(created.user.displayName).toContain("<script>");
    expect(signIn({ email: created.user.email, password: "correct-horse" }).user.displayName).toContain("<script>");
  });
});

describe("relationships", () => {
  it("lets exactly one other person join, and hides the code afterwards", async () => {
    const { createInvite, joinWithCode, getRelationship } = await import("@/server/relationship");
    const ada = await createUser("Ada");
    const bea = await createUser("Bea");
    const cy = await createUser("Cy");
    const invite = createInvite(ada.user.id);
    joinWithCode(bea.user.id, invite.code.toLowerCase());
    expect(getRelationship(ada.user.id)?.status).toBe("active");
    expect(getRelationship(ada.user.id)?.partner?.displayName).toBe("Bea");
    expect(() => joinWithCode(cy.user.id, invite.code)).toThrow(/did not work|already have/);
  });

  it("rejects an expired code and a person's own code", async () => {
    const { createInvite, joinWithCode } = await import("@/server/relationship");
    const ada = await createUser("Ada");
    const bea = await createUser("Bea");
    const invite = createInvite(ada.user.id, Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(() => joinWithCode(bea.user.id, invite.code)).toThrow(/did not work/);
    const fresh = createInvite(ada.user.id);
    expect(() => joinWithCode(ada.user.id, fresh.code)).toThrow(/did not work|already have/);
  });
});

describe("petals", () => {
  it("sends once for a repeated idempotency key, including concurrent attempts", async () => {
    const { createPetal, getPetal } = await import("@/server/petals");
    const { many } = await import("@/server/db");
    const { ada, bea } = await pairUsers();
    const key = randomUUID();
    const first = await createPetal(ada.user.id, key, noteBody("hello"));
    const second = await createPetal(ada.user.id, key, noteBody("hello"));
    expect(second.replayed).toBe(true);
    expect(second.petal.id).toBe(first.petal.id);
    const other = randomUUID();
    await Promise.all([
      createPetal(ada.user.id, other, noteBody("again")),
      createPetal(ada.user.id, other, noteBody("again")),
    ]);
    const rows = many<{ count: number }>("SELECT COUNT(*) AS count FROM petals");
    expect(Number(rows[0].count)).toBe(2);
    expect(getPetal(bea.user.id, first.petal.id).content).toMatchObject({ text: "hello" });
  });

  it("does not create a second petal when the same key is reused with different words", async () => {
    const { createPetal } = await import("@/server/petals");
    const { ada } = await pairUsers();
    const key = randomUUID();
    await createPetal(ada.user.id, key, noteBody("one"));
    await expect(createPetal(ada.user.id, key, noteBody("two"))).rejects.toThrow(/already used/);
  });

  it("hides another couple's petal and a scheduled petal from the recipient", async () => {
    const { createPetal, getPetal, openPetal } = await import("@/server/petals");
    const { ada, bea } = await pairUsers();
    const stranger = await createUser("Cy");
    const sent = await createPetal(ada.user.id, randomUUID(), noteBody("private"));
    expect(() => getPetal(stranger.user.id, sent.petal.id)).toThrow(/isn't here/);
    expect(() => openPetal(stranger.user.id, sent.petal.id)).toThrow(/isn't here/);
    expect(() => openPetal(ada.user.id, sent.petal.id)).toThrow(/already know/);

    const later = Date.now() + 2 * 60 * 60 * 1000;
    const scheduled = await createPetal(ada.user.id, randomUUID(), {
      ...noteBody("tomorrow"),
      schedule: wallIn(later, "Europe/London"),
    });
    expect(scheduled.petal.status).toBe("scheduled");
    expect(() => getPetal(bea.user.id, scheduled.petal.id)).toThrow(/isn't here/);
    expect(getPetal(ada.user.id, scheduled.petal.id).status).toBe("scheduled");
  });

  it("delivers a scheduled petal once, and not after it is taken back", async () => {
    const { createPetal, deletePetal, getPetal, openPetal } = await import("@/server/petals");
    const { deliverDuePetals } = await import("@/server/deliver");
    const { many } = await import("@/server/db");
    const { ada, bea } = await pairUsers();
    const now = Date.now();
    const when = now + 3 * 60 * 60 * 1000;
    const scheduled = await createPetal(ada.user.id, randomUUID(), {
      ...noteBody("later"),
      schedule: wallIn(when, "Europe/London"),
    });
    expect(await deliverDuePetals(now + 60_000)).toBe(0);
    expect(await deliverDuePetals(now + 4 * 60 * 60 * 1000)).toBe(1);
    expect(await deliverDuePetals(now + 4 * 60 * 60 * 1000)).toBe(0);
    const notes = many<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notifications WHERE petal_id = ? AND channel = 'in_app'",
      scheduled.petal.id,
    );
    expect(Number(notes[0].count)).toBe(1);
    const opened = openPetal(bea.user.id, scheduled.petal.id, now + 4 * 60 * 60 * 1000);
    expect(opened.status).toBe("opened");
    expect(openPetal(bea.user.id, scheduled.petal.id, now + 4 * 60 * 60 * 1000 + 1000).openedAt).toBe(opened.openedAt);
    expect(() => deletePetal(ada.user.id, scheduled.petal.id)).toThrow(/stays in the garden/);

    const doomed = await createPetal(ada.user.id, randomUUID(), {
      ...noteBody("nope"),
      schedule: wallIn(now + 5 * 24 * 60 * 60 * 1000, "Europe/London"),
    });
    deletePetal(ada.user.id, doomed.petal.id);
    expect(await deliverDuePetals(now + 6 * 24 * 60 * 60 * 1000)).toBe(0);
    expect(() => getPetal(bea.user.id, doomed.petal.id)).toThrow(/isn't here/);
  });

  it("answers a question once and tells only the sender, inside the app", async () => {
    const { createPetal, openPetal, answerPetal } = await import("@/server/petals");
    const { many } = await import("@/server/db");
    const { ada, bea } = await pairUsers();
    const question = await createPetal(ada.user.id, randomUUID(), {
      type: "question",
      content: { prompt: "What made you smile?", senderNote: "" },
      schedule: null,
      expiresInDays: null,
      random: false,
    });
    openPetal(bea.user.id, question.petal.id);
    const key = randomUUID();
    const answered = answerPetal(bea.user.id, question.petal.id, key, { body: "The light on the table." });
    expect(answered.response?.body).toBe("The light on the table.");
    const again = answerPetal(bea.user.id, question.petal.id, key, { body: "The light on the table." });
    expect(again.response?.body).toBe("The light on the table.");
    expect(() => answerPetal(bea.user.id, question.petal.id, randomUUID(), { body: "Something else" })).toThrow(/already/);
    expect(() => answerPetal(ada.user.id, question.petal.id, randomUUID(), { body: "No" })).toThrow(/wasn't for you/);
    const pushes = many<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notifications WHERE petal_id = ? AND kind = 'answer' AND channel = 'web_push'",
      question.petal.id,
    );
    expect(Number(pushes[0].count)).toBe(0);
    const notes = many<{ user_id: string }>(
      "SELECT user_id FROM notifications WHERE petal_id = ? AND kind = 'answer'",
      question.petal.id,
    );
    expect(notes.map((row) => row.user_id)).toEqual([ada.user.id]);
  });

  it("rejects a petal that references someone else's file", async () => {
    const { createPetal } = await import("@/server/petals");
    const { ada } = await pairUsers();
    await expect(
      createPetal(ada.user.id, randomUUID(), {
        type: "photo",
        content: { mediaId: randomUUID(), caption: "no" },
        schedule: null,
        expiresInDays: null,
        random: false,
      }),
    ).rejects.toThrow(/can't be used/);
  });

  it("keeps an edited arrival time and then lets an unopened petal fade", async () => {
    const { createPetal, updateScheduledPetal, getPetal } = await import("@/server/petals");
    const { deliverDuePetals } = await import("@/server/deliver");
    const { ada, bea } = await pairUsers();
    const now = Date.now();
    const created = await createPetal(ada.user.id, randomUUID(), {
      ...noteBody("first"),
      schedule: wallIn(now + 3 * 60 * 60 * 1000, "Europe/London"),
      expiresInDays: 1,
    });
    await expect(
      updateScheduledPetal(ada.user.id, created.petal.id, {
        content: { text: "second" },
        schedule: wallIn(now + 5 * 60 * 60 * 1000, "Europe/London"),
        expiresInDays: 1,
        expectedUpdatedAt: created.petal.updatedAt - 1,
      }),
    ).rejects.toThrow(/changed/);
    const updated = await updateScheduledPetal(ada.user.id, created.petal.id, {
      content: { text: "second" },
      schedule: wallIn(now + 5 * 60 * 60 * 1000, "Europe/London"),
      expiresInDays: 1,
      expectedUpdatedAt: created.petal.updatedAt,
    });
    expect(updated.content).toMatchObject({ text: "second" });
    expect(await deliverDuePetals(now + 4 * 60 * 60 * 1000)).toBe(0);
    expect(await deliverDuePetals(now + 6 * 60 * 60 * 1000)).toBe(1);
    expect(getPetal(bea.user.id, created.petal.id).content).toMatchObject({ text: "second" });
    expect(await deliverDuePetals(now + 31 * 60 * 60 * 1000)).toBe(0);
    expect(getPetal(bea.user.id, created.petal.id).status).toBe("expired");
  });
});

function wallIn(epochMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour"), minute: pick("minute") };
}
