import { fail, isResponse, json, readJson } from "@/lib/http";
import { findPost, newId } from "@/lib/store";

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
  post.status = "scheduled";
  post.scheduledFor = new Date(when).toISOString();
  post.providerPostId = post.providerPostId ?? newId("provider");
  post.error = null;
  return json({ post });
}
