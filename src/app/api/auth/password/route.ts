import { changePassword } from "@/server/auth";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user, token } = requireSession(req);
    const body = (await readJson(req)) as { currentPassword?: string; newPassword?: string };
    changePassword(user.id, body.currentPassword ?? "", body.newPassword ?? "", token);
    return json({ ok: true });
  });
}
