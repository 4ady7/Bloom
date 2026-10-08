import { assertIdempotencyKey, assertMutation, json, readJson, withErrors } from "@/server/http";
import { answerPetal } from "@/server/petals";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const key = assertIdempotencyKey(req.headers.get("idempotency-key"));
    const body = await readJson(req);
    const petal = answerPetal(user.id, id, key, body);
    return json({ petal });
  });
}
