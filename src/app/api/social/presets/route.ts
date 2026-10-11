import { fail, isResponse, readJson } from "@/lib/http";
import { isPlatform } from "@/lib/model";
import { respond } from "@/lib/social";
import { readPresetBody } from "@/lib/social/presets";

/** Platform presets: saved per-platform posting options. ?kind=caption lists caption styles instead. */
export async function GET(req: Request) {
  const caption = new URL(req.url).searchParams.get("kind") === "caption";
  return respond(async (ss) => ({ presets: caption ? await ss.listCaptionPresets() : await ss.listPresets() }));
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const preset = readPresetBody(body, true);
  if ("error" in preset) return fail("bad_preset", preset.error, 422);
  if (body.kind === "caption") {
    return respond(async (ss) => ({ preset: await ss.createCaptionPreset({ name: preset.name!, settings: preset.settings ?? {} }) }), 201);
  }
  if (!isPlatform(body.platform)) return fail("bad_platform", `A platform preset needs a platform; got "${String(body.platform)}".`, 422);
  const platform = body.platform;
  return respond(async (ss) => ({ preset: await ss.createPreset({ name: preset.name!, platform, settings: preset.settings ?? {} }) }), 201);
}
