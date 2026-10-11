import { fail, isResponse, json, readJson } from "@/lib/http";
import { isPlatform, PLATFORMS, type Platform } from "@/lib/model";
import { createRun, getState, recordEvent } from "@/lib/store";

export function GET() {
  return json({ runs: getState().runs });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const state = getState();
  if (!state.brief) return fail("no_brief", "No Brief yet. Add the Company URL first.", 404);
  if (!state.brief.approved) {
    return fail("brief_not_approved", "The Brief is not approved. Approve it on the Company page before generating.", 409);
  }
  const raw = Array.isArray(body.platforms) ? body.platforms : [];
  if (raw.length === 0) {
    return fail("no_platforms", `Choose at least one platform: ${PLATFORMS.join(", ")}.`, 422);
  }
  const platforms: Platform[] = [];
  for (const value of raw) {
    if (!isPlatform(value)) {
      return fail("bad_platform", `Unknown platform "${String(value)}". Choose from: ${PLATFORMS.join(", ")}.`, 422);
    }
    if (!platforms.includes(value)) platforms.push(value);
  }
  const result = createRun(platforms);
  recordEvent("run_started", { runId: result.run.id, platforms });
  for (const ad of result.ads) {
    recordEvent("variant_generated", { adId: ad.id, platform: ad.platform, variants: ad.variants.map((v) => v.id) });
  }
  return json(result, 201);
}
