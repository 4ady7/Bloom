import { FLOWER_CATALOG } from "@/domain/flowers";
import { json, withErrors } from "@/server/http";
import { listFlowerProviders } from "@/server/flower-providers";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    requireSession(req);
    return json({ flowers: FLOWER_CATALOG, providers: listFlowerProviders() });
  });
}
