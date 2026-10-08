import { leaveRelationship } from "@/server/relationship";
import { assertMutation, json, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    leaveRelationship(user.id);
    return json({ ok: true });
  });
}
