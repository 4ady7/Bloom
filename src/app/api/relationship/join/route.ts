import { joinWithCode } from "@/server/relationship";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const body = (await readJson(req)) as { code?: string };
    const relationship = joinWithCode(user.id, body.code ?? "");
    return json({ relationship });
  });
}
