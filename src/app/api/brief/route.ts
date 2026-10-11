import { fail, isResponse, json, readJson } from "@/lib/http";
import { track } from "@/lib/analytics/events";
import { getState, updateBrief, updateVoice } from "@/lib/store";

export function GET() {
  const state = getState();
  if (!state.brief) return fail("no_brief", "No Brief yet. Add the Company URL first.", 404);
  return json({ brief: state.brief, voice: state.voice });
}

export async function PUT(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const state = getState();
  if (!state.brief) return fail("no_brief", "No Brief yet. Add the Company URL first.", 404);
  if (body.text !== undefined && typeof body.text !== "string") {
    return fail("bad_text", "The Brief text must be a string.", 422);
  }
  if (body.approved !== undefined && typeof body.approved !== "boolean") {
    return fail("bad_approved", "approved must be true or false.", 422);
  }
  const wasApproved = state.brief.approved;
  const brief = updateBrief({ text: body.text as string | undefined, approved: body.approved as boolean | undefined });
  if (body.voice && typeof body.voice === "object") {
    const voice = body.voice as Record<string, unknown>;
    updateVoice({
      tone: typeof voice.tone === "string" ? voice.tone : undefined,
      rules: Array.isArray(voice.rules) ? voice.rules.map(String) : undefined,
      bannedWords: Array.isArray(voice.bannedWords) ? voice.bannedWords.map(String) : undefined,
    });
  }
  if (brief?.approved && !wasApproved) await track("brief_approved", { briefId: brief.id });
  return json({ brief, voice: getState().voice });
}
