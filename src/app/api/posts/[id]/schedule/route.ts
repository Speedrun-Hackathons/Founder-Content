import { fail, isResponse, json, readJson } from "@/lib/http";
import { applyProviderPost, serviceFailure, socialStreamline, SocialStreamlineError } from "@/lib/social";
import { findPost } from "@/lib/store";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const post = findPost(id);
  if (!post) return fail("no_post", `No Post ${id}.`, 404);
  const when = typeof body.scheduledFor === "string" ? Date.parse(body.scheduledFor) : NaN;
  if (Number.isNaN(when)) {
    return fail("bad_time", `scheduledFor "${String(body.scheduledFor)}" is not an ISO date-time.`, 422);
  }
  if (when <= Date.now()) return fail("past_time", "scheduledFor must be in the future.", 422);
  if (post.status === "published") return fail("already_published", `Post ${id} is already published.`, 409);
  if (!post.providerPostId) return fail("no_provider_post", `Post ${id} has no draft in the posting service.`, 409);

  const scheduledFor = new Date(when).toISOString();
  try {
    const provider = await socialStreamline().schedulePost(post.providerPostId, scheduledFor, `schedule:${post.providerPostId}:${scheduledFor}`);
    applyProviderPost(post, provider);
    post.scheduledFor = provider.scheduledFor ?? scheduledFor;
  } catch (err) {
    if (err instanceof SocialStreamlineError && err.status < 500 && err.status !== 429) post.error = err.message;
    return serviceFailure(err);
  }
  return json({ post });
}
