import { json, readCookie, withErrors } from "@/server/http";
import { userFromToken } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    const user = userFromToken(readCookie(req, "bloom_session"));
    if (!user) return json({ user: null }, 401);
    return json({ user });
  });
}
