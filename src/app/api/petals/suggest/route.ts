import { PETAL_TYPES, type PetalType } from "@/domain/types";
import { json, withErrors } from "@/server/http";
import { suggestPetal } from "@/server/petals";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    const avoid = new URL(req.url).searchParams.get("avoid");
    const avoidType = PETAL_TYPES.includes(avoid as PetalType) ? (avoid as PetalType) : null;
    return json(suggestPetal(user.id, avoidType));
  });
}
