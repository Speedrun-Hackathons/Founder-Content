import { createHash } from "node:crypto";
import { fail, isResponse, readJson } from "@/lib/http";
import { respond } from "@/lib/social";

/**
 * Transcribes a video or audio file. The answer is usually still pending, so the page asks again
 * with the same URL: the media id is derived from the URL, and the service returns its cached
 * record for a known id without charging a second time.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  if (!mediaUrl.startsWith("https://")) return fail("bad_media", "mediaUrl must be a public https URL.", 422);
  const mediaId = `fc-${createHash("sha256").update(mediaUrl).digest("hex").slice(0, 40)}`;
  return respond(async (ss) => ({ transcription: await ss.transcribe(mediaUrl, mediaId) }));
}
