import { assertIdempotencyKey, assertMutation, json, readJson, withErrors } from "@/server/http";
import { plantFlowerFromPetal } from "@/server/gardens";
import { requireSession } from "@/server/session";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const key = assertIdempotencyKey(req.headers.get("idempotency-key"));
    const body = z
      .object({ petalId: z.string().uuid() })
      .strict()
      .parse(await readJson(req));
    const flower = plantFlowerFromPetal(user.id, {
      gardenId: id,
      petalId: body.petalId,
      idempotencyKey: key,
    });
    return json({ flower }, 201);
  });
}
