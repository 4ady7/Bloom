import { signUp } from "@/server/auth";
import { clientAddress, json, readJson, sessionCookie, withErrors, assertMutation } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const body = (await readJson(req)) as {
      email?: string;
      password?: string;
      displayName?: string;
      timezone?: string;
    };
    const result = signUp({
      email: body.email ?? "",
      password: body.password ?? "",
      displayName: body.displayName ?? "",
      timezone: body.timezone ?? "",
      userAgent: req.headers.get("user-agent"),
      ip: clientAddress(req),
    });
    return json({ user: result.user }, 201, { "set-cookie": sessionCookie(result.token, result.maxAgeSeconds) });
  });
}
