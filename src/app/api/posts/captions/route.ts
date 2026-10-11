// #7: one caption per chosen Platform in the Voice, written by the posting service, and a draft per
// Platform. A Platform that failed answers with its own error next to the ones that worked.

import { fail, isResponse, json, readJson } from "@/lib/http";
import { isPlatform, PLATFORMS, type Platform, type Post, type Run } from "@/lib/model";
import { applyProviderPost, serviceFailure, socialStreamline } from "@/lib/social";
import { captionTranscript } from "@/lib/social/transcript";
import { track } from "@/lib/analytics/events";
import { getState, newId, now } from "@/lib/store";

type Result = { platform: Platform; ok: true; post: Post } | { platform: Platform; ok: false; error: string };

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const state = getState();
  if (!state.brief) return fail("no_brief", "No Brief yet. Add the Company URL first.", 404);
  if (!state.brief.approved) {
    return fail("brief_not_approved", "The Brief is not approved. Approve it on the Company page before generating.", 409);
  }
  const raw = Array.isArray(body.platforms) ? body.platforms : [];
  if (raw.length === 0) return fail("no_platforms", `Choose at least one platform: ${PLATFORMS.join(", ")}.`, 422);
  const platforms: Platform[] = [];
  for (const value of raw) {
    if (!isPlatform(value)) {
      return fail("bad_platform", `Unknown platform "${String(value)}". Choose from: ${PLATFORMS.join(", ")}.`, 422);
    }
    if (!platforms.includes(value)) platforms.push(value);
  }

  let client;
  try {
    client = socialStreamline();
  } catch (err) {
    return serviceFailure(err);
  }

  const run: Run = { id: newId("run"), briefId: state.brief.id, platforms, startedAt: now(), publishedAt: null, runTimeSeconds: null };
  state.runs.push(run);
  await track("run_started", { runId: run.id, platforms });

  let captions;
  try {
    captions = await client.generateCaptions(captionTranscript(state.brief.text, state.voice), platforms, `captions:${run.id}`);
  } catch (err) {
    return serviceFailure(err);
  }

  const results = await Promise.all(
    captions.map(async (caption): Promise<Result> => {
      if (caption.text === null) return { platform: caption.platform, ok: false, error: caption.error };
      try {
        const provider = await client.createDraft(
          { content: caption.text, platforms: [caption.platform] },
          `draft:${run.id}:${caption.platform}`,
        );
        const post: Post = {
          id: newId("post"),
          runId: run.id,
          variantId: "",
          platform: caption.platform,
          origin: "caption",
          text: caption.text,
          status: "draft",
          scheduledFor: null,
          providerPostId: null,
          error: null,
        };
        applyProviderPost(post, provider);
        state.posts.push(post);
        return { platform: caption.platform, ok: true, post };
      } catch (err) {
        return { platform: caption.platform, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  return json({ run, results }, 201);
}
