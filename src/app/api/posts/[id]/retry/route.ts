import { fail, json } from "@/lib/http";
import { applyProviderPost, recordIfPublished, serviceFailure, socialStreamline, SocialStreamlineError } from "@/lib/social";
import { findPost } from "@/lib/store";

/** Re-sends only the platforms that failed; the posting service never re-sends one that went out. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = findPost(id);
  if (!post) return fail("no_post", `No Post ${id}.`, 404);
  if (post.status !== "failed") return fail("not_failed", `Post ${id} is ${post.status}; only a failed Post can be retried.`, 409);
  if (!post.providerPostId) return fail("no_provider_post", `Post ${id} has no draft in the posting service.`, 409);

  const before = post.status;
  try {
    const provider = await socialStreamline().retryFailedPlatforms(post.providerPostId, `retry:${post.providerPostId}:${Date.now()}`);
    applyProviderPost(post, provider);
  } catch (err) {
    if (err instanceof SocialStreamlineError && err.status < 500 && err.status !== 429) post.error = err.message;
    return serviceFailure(err);
  }
  await recordIfPublished(post, before);
  return json({ post });
}
