import { AppError } from "@/server/errors";
import { deliverDuePetals } from "@/server/deliver";
import { assertMutation, json, withErrors } from "@/server/http";
import { openPetal } from "@/server/petals";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isForm(req: Request): boolean {
  const type = req.headers.get("content-type") ?? "";
  return type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    await deliverDuePetals();
    const form = isForm(req);
    try {
      const petal = openPetal(user.id, id);
      if (form) {
        return new Response(null, {
          status: 303,
          headers: { location: `/petal/${id}`, "cache-control": "no-store" },
        });
      }
      return json({ petal });
    } catch (error) {
      if (form && error instanceof AppError) {
        const notice = encodeURIComponent(error.message);
        return new Response(null, {
          status: 303,
          headers: { location: `/petal/${id}?notice=${notice}`, "cache-control": "no-store" },
        });
      }
      throw error;
    }
  });
}
