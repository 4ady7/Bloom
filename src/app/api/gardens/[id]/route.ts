import { archiveGarden, getGarden, listGardenFlowers, updateGarden } from "@/server/gardens";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const garden = getGarden(user.id, id);
    const page = listGardenFlowers(user.id, id, cursor);
    return json({ garden, flowers: page.flowers, nextCursor: page.nextCursor });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const garden = updateGarden(user.id, id, await readJson(req));
    return json({ garden });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    return json(archiveGarden(user.id, id));
  });
}
