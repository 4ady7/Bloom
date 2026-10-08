import { getHome } from "@/server/petals";
import { json, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    const home = await getHome(user.id);
    return json({ season: home.garden.season, elements: home.garden.elements });
  });
}
