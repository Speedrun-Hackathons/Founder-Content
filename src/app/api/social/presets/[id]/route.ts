import { fail, isResponse, readJson } from "@/lib/http";
import { respond } from "@/lib/social";
import { readPresetBody } from "@/lib/social/presets";

/** Edits a preset; ?kind=caption for a caption style. Only the fields sent change. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const patch = readPresetBody(body, false);
  if ("error" in patch) return fail("bad_preset", patch.error, 422);
  const caption = new URL(req.url).searchParams.get("kind") === "caption";
  return respond(async (ss) => ({ preset: caption ? await ss.updateCaptionPreset(id, patch) : await ss.updatePreset(id, patch) }));
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caption = new URL(req.url).searchParams.get("kind") === "caption";
  return respond(async (ss) => {
    if (caption) await ss.deleteCaptionPreset(id);
    else await ss.deletePreset(id);
    return { deleted: true, id };
  });
}
