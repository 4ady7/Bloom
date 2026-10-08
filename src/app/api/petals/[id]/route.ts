import { deliverDuePetals } from "@/server/deliver";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { markAnswerNotificationsRead } from "@/server/notifications";
import { deletePetal, getPetal, updateScheduledPetal } from "@/server/petals";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    await deliverDuePetals();
    const { id } = await ctx.params;
    markAnswerNotificationsRead(user.id, id, Date.now());
    return json({ petal: getPetal(user.id, id) });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const body = await readJson(req);
    const petal = await updateScheduledPetal(user.id, id, body);
    return json({ petal });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    return json(deletePetal(user.id, id));
  });
}
