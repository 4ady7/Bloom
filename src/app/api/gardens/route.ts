import { createGarden, listGardens } from "@/server/gardens";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    return json({ gardens: listGardens(user.id) });
  });
}

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const body = await readJson(req);
    const garden = createGarden(user.id, body);
    return json({ garden }, 201);
  });
}
