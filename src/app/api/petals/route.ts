import { deliverDuePetals } from "@/server/deliver";
import { assertIdempotencyKey, assertMutation, json, readJson, withErrors } from "@/server/http";
import { createPetal, listPetals } from "@/server/petals";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    await deliverDuePetals();
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    return json(listPetals(user.id, cursor, Number.isFinite(limit) ? limit : 20));
  });
}

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const key = assertIdempotencyKey(req.headers.get("idempotency-key"));
    const body = await readJson(req);
    const result = await createPetal(user.id, key, body);
    return json({ petal: result.petal }, result.replayed ? 200 : 201);
  });
}

