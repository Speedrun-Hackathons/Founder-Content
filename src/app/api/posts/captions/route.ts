// #7: one caption per chosen Platform in the Voice, written by the posting service, and a draft per
// Platform. A Platform that failed answers with its own error next to the ones that worked.
// With { mediaUrl, transcript } the captions are written about a video (its transcript joins the
// Brief) and every draft carries the video, which TikTok and YouTube need. With { blogId, link } they
// promote a saved blog post and end with its link.

import { fail, isResponse, json, readJson } from "@/lib/http";
import { ensureCompanyLoaded } from "@/lib/content/archive";
import { blogStore } from "@/lib/content/blogs";
import { isPlatform, PLATFORMS, type Platform, type Post, type Run } from "@/lib/model";
import { applyProviderPost, serviceFailure, socialStreamline } from "@/lib/social";
import { captionTranscript } from "@/lib/social/transcript";
import { founderId, getState, newId, now, recordEvent } from "@/lib/store";

type Result = { platform: Platform; ok: true; post: Post } | { platform: Platform; ok: false; error: string };

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  await ensureCompanyLoaded();
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
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  if (mediaUrl && !mediaUrl.startsWith("https://")) {
    return fail("bad_media", `mediaUrl "${mediaUrl}" must be a public https URL.`, 422);
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";

  // { blogId, link? } writes posts that promote a saved blog post.
  let blog: { title: string; markdown: string; link?: string } | undefined;
  if (typeof body.blogId === "string" && body.blogId) {
    const link = typeof body.link === "string" ? body.link.trim() : "";
    if (link && !link.startsWith("https://")) return fail("bad_link", `link "${link}" must be a public https URL.`, 422);
    let saved;
    try {
      saved = await blogStore().get(founderId(), body.blogId);
    } catch (err) {
      return fail("blogs_unavailable", `The blog post could not be read: ${err instanceof Error ? err.message : String(err)}`, 502);
    }
    if (!saved) return fail("no_blog", `No blog post ${body.blogId}.`, 404);
    blog = { title: saved.title, markdown: saved.markdown, link: link || undefined };
  }

  let client;
  try {
    client = socialStreamline();
  } catch (err) {
    return serviceFailure(err);
  }

  const run: Run = { id: newId("run"), briefId: state.brief.id, platforms, startedAt: now(), publishedAt: null, runTimeSeconds: null };
  state.runs.push(run);
  recordEvent("run_started", { runId: run.id, platforms });

  let captions;
  try {
    captions = await client.generateCaptions(captionTranscript({ brief: state.brief.text, voice: state.voice, documents: state.documents, video: transcript, blog }), platforms, `captions:${run.id}`);
  } catch (err) {
    return serviceFailure(err);
  }

  const results = await Promise.all(
    captions.map(async (caption): Promise<Result> => {
      if (caption.text === null) return { platform: caption.platform, ok: false, error: caption.error };
      try {
        const provider = await client.createDraft(
          { content: caption.text, platforms: [caption.platform], mediaUrls: mediaUrl ? [mediaUrl] : [] },
          `draft:${run.id}:${caption.platform}`,
        );
        const post: Post = {
          id: newId("post"),
          runId: run.id,
          variantId: "",
          platform: caption.platform,
          origin: "caption",
          text: caption.text,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
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
