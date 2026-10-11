// #11: queue a short (vertical) or long (landscape) render from clips already uploaded. Spends
// credits, so the balance is checked first; the Studio page then polls /api/social/jobs/{id}.

import { fail, isResponse, readJson } from "@/lib/http";
import { respond, SocialStreamlineError } from "@/lib/social";
import type { Clip, LongVideoRequest, ShortVideoRequest } from "@/lib/social/client";

const POSITIONS = ["lower_right", "lower_center", "lower_left", "center_left", "upper_left", "top_center", "upper_right", "center_right"];

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const format = body.format;
  if (format !== "short" && format !== "long") return fail("bad_format", `format must be "short" or "long", not "${String(format)}".`, 422);

  const rawClips = Array.isArray(body.clips) ? body.clips : [];
  if (rawClips.length === 0 || rawClips.length > 20) return fail("bad_clips", "Add between 1 and 20 clips.", 422);
  const clips: Clip[] = [];
  for (const [index, raw] of rawClips.entries()) {
    const clip = (raw ?? {}) as Record<string, unknown>;
    const facecamUrl = typeof clip.facecamUrl === "string" ? clip.facecamUrl : "";
    const desktopUrl = typeof clip.desktopUrl === "string" && clip.desktopUrl ? clip.desktopUrl : undefined;
    if (!facecamUrl.startsWith("https://")) return fail("bad_clips", `Clip ${index + 1} needs a facecam video at a public https URL.`, 422);
    if (desktopUrl && !desktopUrl.startsWith("https://")) return fail("bad_clips", `Clip ${index + 1}: the screen capture must be a public https URL.`, 422);
    clips.push(desktopUrl ? { facecamUrl, desktopUrl } : { facecamUrl });
  }

  const on = (key: string) => body[key] === true;
  const captions = { enabled: on("captions") };
  const removeSilence = { enabled: on("removeSilence") };

  let request: { format: "short"; body: ShortVideoRequest } | { format: "long"; body: LongVideoRequest };
  if (format === "short") {
    const mode = clips.every((c) => c.desktopUrl) && body.mode === "stacked" ? "stacked" : "facecam_only";
    if (body.mode === "stacked" && mode !== "stacked") return fail("bad_clips", "Stacked mode needs a screen capture on every clip.", 422);
    request = { format, body: { clips, mode, captions, removeSilence, removeFillerWords: { enabled: on("removeFillerWords") } } };
  } else {
    const position = typeof body.facecamPosition === "string" ? body.facecamPosition : "lower_right";
    if (!POSITIONS.includes(position)) return fail("bad_position", `facecamPosition must be one of ${POSITIONS.join(", ")}.`, 422);
    const scale = typeof body.facecamScale === "number" ? Math.round(body.facecamScale) : 25;
    if (scale < 10 || scale > 60) return fail("bad_scale", "facecamScale is a percentage of the frame between 10 and 60.", 422);
    request = { format, body: { clips, facecamPosition: position, facecamScale: scale, captions, removeSilence, faceTracking: on("faceTracking") } };
  }

  return respond(async (ss) => {
    const credits = await ss.credits();
    if (credits.available <= 0) {
      throw new SocialStreamlineError(422, "no_credits", "No credits left in Social Streamline; add credits before starting a render.", null);
    }
    const key = `render:${crypto.randomUUID()}`;
    const job = request.format === "short" ? await ss.createShortVideo(request.body, key) : await ss.createLongVideo(request.body, key);
    return { job, credits };
  }, 201);
}
