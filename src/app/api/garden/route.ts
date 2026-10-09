import { listGardens, primaryGardenPreview } from "@/server/gardens";
import { getHome } from "@/server/petals";
import { json, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Legacy home-preview endpoint. Prefer /api/gardens. */
export async function GET(req: Request) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    const home = await getHome(user.id);
    const gardens = home.relationship?.status === "active" ? listGardens(user.id) : [];
    const primary = gardens.find((garden) => garden.isPrimary) ?? gardens[0] ?? null;
    const flowers =
      home.relationship?.status === "active" ? primaryGardenPreview(home.relationship.id, 48) : [];
    return json({
      season: home.garden.season,
      elements: home.garden.elements,
      gardens,
      primaryGardenId: primary?.id ?? null,
      flowers,
    });
  });
}
