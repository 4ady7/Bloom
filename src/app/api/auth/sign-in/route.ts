import { signIn } from "@/server/auth";
import { assertMutation, clientAddress, json, readJson, sessionCookie, withErrors } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const body = (await readJson(req)) as { email?: string; password?: string };
    const result = signIn({
      email: body.email ?? "",
      password: body.password ?? "",
      userAgent: req.headers.get("user-agent"),
      ip: clientAddress(req),
    });
    return json({ user: result.user }, 200, { "set-cookie": sessionCookie(result.token, result.maxAgeSeconds) });
  });
}
