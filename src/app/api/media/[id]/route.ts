import { json, withErrors } from "@/server/http";
import { getAuthorizedMedia, readMediaFile } from "@/server/media";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { user } = requireSession(req);
    const { id } = await ctx.params;
    const media = getAuthorizedMedia(user.id, id);
    const bytes = readMediaFile(media);
    const headers = new Headers({
      "content-type": media.detected_type,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "accept-ranges": "bytes",
      "content-disposition": "inline",
    });
    const range = req.headers.get("range");
    if (range && media.kind === "audio") {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
      if (!match) return json({ error: { code: "BAD_RANGE", message: "That range could not be read." } }, 416);
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : bytes.length - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= bytes.length) {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.length}` } });
      }
      const safeEnd = Math.min(end, bytes.length - 1);
      const slice = bytes.subarray(start, safeEnd + 1);
      headers.set("content-range", `bytes ${start}-${safeEnd}/${bytes.length}`);
      headers.set("content-length", String(slice.length));
      return new Response(new Uint8Array(slice), { status: 206, headers });
    }
    headers.set("content-length", String(bytes.length));
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  });
}
