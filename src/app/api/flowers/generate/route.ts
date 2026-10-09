import { isFlowerStyle } from "@/domain/flowers";
import { generateFlower } from "@/server/flower-providers";
import { assertMutation, json, readJson, withErrors } from "@/server/http";
import { requireSession } from "@/server/session";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const body = z
      .object({
        provider: z.enum(["builtin", "generated"]).optional(),
        flowerKey: z.string().max(40).optional(),
        style: z.string().max(40).optional(),
        mood: z.string().max(80).optional(),
        colors: z.array(z.string().max(40)).max(4).optional(),
      })
      .strict()
      .parse(await readJson(req));
    const result = await generateFlower(user.id, {
      provider: body.provider,
      flowerKey: body.flowerKey,
      style: body.style && isFlowerStyle(body.style) ? body.style : undefined,
      mood: body.mood,
      colors: body.colors,
    });
    return json({ flower: result });
  });
}
