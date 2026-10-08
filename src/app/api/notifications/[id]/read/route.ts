import { run } from "@/server/db";
import { assertMutation, json, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    run(
      `UPDATE notifications SET status = 'read', read_at = ?
       WHERE id = ? AND user_id = ? AND channel = 'in_app' AND status = 'sent'`,
      Date.now(),
      id,
      user.id,
    );
    return json({ ok: true });
  });
}
