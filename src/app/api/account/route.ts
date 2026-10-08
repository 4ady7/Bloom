import { deleteAccount, updateAccount } from "@/server/auth";
import { assertMutation, clearSessionCookie, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const body = (await readJson(req)) as { displayName?: string; timezone?: string };
    const updated = updateAccount(user.id, { displayName: body.displayName, timezone: body.timezone });
    return json({ user: updated });
  });
}

export async function DELETE(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const body = (await readJson(req)) as { password?: string };
    deleteAccount(user.id, body.password ?? "");
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  });
}
