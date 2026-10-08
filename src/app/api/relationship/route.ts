import { getRelationship } from "@/server/relationship";
import { json, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    return json({ relationship: getRelationship(user.id) });
  });
}
