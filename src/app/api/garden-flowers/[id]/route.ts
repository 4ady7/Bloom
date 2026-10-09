import { moveFlower, removeFlowerFromGarden } from "@/server/gardens";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const flower = moveFlower(user.id, id, await readJson(req));
    return json({ flower });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    return json(removeFlowerFromGarden(user.id, id));
  });
}
