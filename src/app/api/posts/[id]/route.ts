import { fail, isResponse, json, readJson } from "@/lib/http";
import { serviceFailure, socialStreamline } from "@/lib/social";
import { findPost, getState } from "@/lib/store";

/** Edits the text of a Post that has not been sent yet, in the posting service and here. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const post = findPost(id);
  if (!post) return fail("no_post", `No Post ${id}.`, 404);
  if (post.status !== "draft") return fail("not_draft", `Post ${id} is ${post.status}; only a draft can be edited.`, 409);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return fail("bad_text", "The Post text cannot be empty.", 422);

  if (post.providerPostId) {
    try {
      await socialStreamline().updatePost(post.providerPostId, { content: text });
    } catch (err) {
      return serviceFailure(err);
    }
  }
  post.text = text;
  post.error = null;
  return json({ post });
}

/** Deletes a Post here and in the posting service. Anything already published stays on the platform. */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = findPost(id);
  if (!post) return fail("no_post", `No Post ${id}.`, 404);
  if (post.providerPostId) {
    try {
      await socialStreamline().deletePost(post.providerPostId);
    } catch (err) {
      return serviceFailure(err);
    }
  }
  const posts = getState().posts;
  posts.splice(posts.indexOf(post), 1);
  return json({ deleted: true, postId: id });
}
