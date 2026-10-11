import { generateAds, saveFailures } from "@/lib/ads/generate";
import { publicBaseUrl } from "@/lib/ads/media";
import { track } from "@/lib/analytics/events";
import { fail, isResponse, json, readJson } from "@/lib/http";
import { isPlatform, PLATFORMS, type Platform, type Run } from "@/lib/model";
import { getState, newId, now } from "@/lib/store";

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
  const { company, voice } = state;
  if (!company || !voice) return fail("no_voice", "No Company or Voice yet. Add the Company URL first.", 404);
  const run: Run = {
    id: newId("run"),
    briefId: state.brief.id,
    platforms,
    startedAt: now(),
    publishedAt: null,
    runTimeSeconds: null,
  };
  state.runs.push(run);
  await track("run_started", { runId: run.id, platforms });
  const { ads, failures } = await generateAds({
    run,
    brief: state.brief.text,
    voice,
    company: { name: company.name, url: company.url },
    baseUrl: publicBaseUrl(req),
  });
  state.ads.push(...ads);
  saveFailures(run.id, failures);
  for (const ad of ads) {
    await track("variant_generated", { adId: ad.id, platform: ad.platform, variants: ad.variants.map((v) => v.id) });
  }
  return json({ run, ads, failures }, 201);
}
