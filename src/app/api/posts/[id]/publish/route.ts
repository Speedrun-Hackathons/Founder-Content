import { fail, json } from "@/lib/http";
import { findPost, markRunPublished, newId, recordEvent } from "@/lib/store";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = findPost(id);
  if (!post) return fail("no_post", `No Post ${id}.`, 404);
  if (post.status === "published") return fail("already_published", `Post ${id} is already published.`, 409);
  post.status = "published";
  post.scheduledFor = null;
  post.providerPostId = post.providerPostId ?? newId("provider");
  post.error = null;
  markRunPublished(post.runId);
  recordEvent("post_published", { postId: post.id, platform: post.platform });
  return json({ post });
}
