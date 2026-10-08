import { z } from "zod";
import { newId } from "@/server/crypto";
import { AppError } from "@/server/errors";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { isPushEndpoint, pushConfigured, pushPublicKey, removeSubscription, saveSubscription } from "@/server/push";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const subscriptionSchema = z
  .object({
    endpoint: z.string().url().max(2000),
    keys: z
      .object({
        p256dh: z.string().min(1).max(300),
        auth: z.string().min(1).max(300),
      })
      .strict(),
  })
  .strict();

export async function GET(req: Request) {
  return withErrors(async () => {
    requireSession(req);
    return json({ enabled: pushConfigured(), publicKey: pushPublicKey() });
  });
}

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    if (!pushConfigured()) {
      throw new AppError("PUSH_UNAVAILABLE", "Quiet phone taps aren't set up on this server.", 409);
    }
    const body = subscriptionSchema.parse(await readJson(req));
    if (!isPushEndpoint(body.endpoint)) {
      throw new AppError("INVALID_INPUT", "That notification subscription can't be kept.", 400);
    }
    saveSubscription({
      id: newId(),
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers.get("user-agent"),
      now: Date.now(),
    });
    return json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const body = (await readJson(req)) as { endpoint?: string };
    if (body.endpoint) removeSubscription(user.id, body.endpoint);
    return json({ ok: true });
  });
}
