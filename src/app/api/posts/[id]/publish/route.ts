import { fail, json } from "@/lib/http";
import { applyProviderPost, recordIfPublished, serviceFailure, socialStreamline, SocialStreamlineError } from "@/lib/social";
import { findPost } from "@/lib/store";

/** Sends now to the connected account. Irreversible: it reaches a real audience. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = findPost(id);
  if (!post) return fail("no_post", `No Post ${id}.`, 404);
  if (post.status === "published") return fail("already_published", `Post ${id} is already published.`, 409);
  if (!post.providerPostId) return fail("no_provider_post", `Post ${id} has no draft in the posting service.`, 409);

  try {
    const provider = await socialStreamline().publishPost(post.providerPostId, `publish:${post.providerPostId}`);
    applyProviderPost(post, provider);
  } catch (err) {
    // A refusal stays on the Post too, so the list shows the platform's reason next to it.
    if (err instanceof SocialStreamlineError && err.status < 500 && err.status !== 429) post.error = err.message;
    return serviceFailure(err);
  }
  recordIfPublished(post, "draft");
  return json({ post });
}
