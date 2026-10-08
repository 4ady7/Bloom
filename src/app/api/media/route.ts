import { AppError } from "@/server/errors";
import { assertMutation, json, withErrors } from "@/server/http";
import { saveMedia } from "@/server/media";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  return withErrors(async () => {
    assertMutation(req);
    const { user } = requireSession(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("INVALID_MEDIA", "Choose a photo or a short audio clip.", 400);
    }
    if (file.size > MAX_BYTES) {
      throw new AppError("INVALID_MEDIA", "That file is too heavy to keep.", 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
      throw new AppError("INVALID_MEDIA", "That file is too heavy to keep.", 400);
    }
    const saved = await saveMedia({ userId: user.id, bytes });
    return json({ media: saved }, 201);
  });
}
