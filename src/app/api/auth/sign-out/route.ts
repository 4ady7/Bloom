import { signOut } from "@/server/auth";
import { assertMutation, clearSessionCookie, json, readCookie, withErrors } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    signOut(readCookie(req, "bloom_session"));
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  });
}
