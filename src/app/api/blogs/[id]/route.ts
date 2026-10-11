import { fail, isResponse, json, readJson } from "@/lib/http";
import { ensureCompanyLoaded } from "@/lib/content/archive";
import { toSlug } from "@/lib/content/blog-ai";
import { bannedWordsIn, blogStore } from "@/lib/content/blogs";
import { founderId, getState, now } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

function unavailable(err: unknown) {
  return fail("blogs_unavailable", `The blog posts could not be reached: ${err instanceof Error ? err.message : String(err)}`, 502);
}

export async function GET(_req: Request, context: Params) {
  const { id } = await context.params;
  try {
    const post = await blogStore().get(founderId(), id);
    return post ? json({ post }) : fail("no_blog", `No blog post ${id}.`, 404);
  } catch (err) {
    return unavailable(err);
  }
}

/** Edits the title, slug, meta description, tags or body. The banned-word check runs again. */
export async function PATCH(req: Request, context: Params) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  await ensureCompanyLoaded();
  try {
    const post = await blogStore().get(founderId(), id);
    if (!post) return fail("no_blog", `No blog post ${id}.`, 404);
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) return fail("bad_title", "The title cannot be empty.", 422);
      post.title = body.title.trim();
    }
    if (body.slug !== undefined) {
      const slug = typeof body.slug === "string" ? toSlug(body.slug) : "";
      if (!slug) return fail("bad_slug", "The slug needs at least one letter or number.", 422);
      post.slug = slug;
    }
    if (typeof body.metaDescription === "string") post.metaDescription = body.metaDescription.trim();
    if (Array.isArray(body.tags)) post.tags = body.tags.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 12);
    if (body.markdown !== undefined) {
      if (typeof body.markdown !== "string" || !body.markdown.trim()) return fail("bad_markdown", "The post body cannot be empty.", 422);
      post.markdown = body.markdown;
    }
    post.warnings = bannedWordsIn(`${post.title}\n${post.markdown}`, getState().voice);
    post.updatedAt = now();
    await blogStore().save(founderId(), post);
    return json({ post });
  } catch (err) {
    return unavailable(err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  const { id } = await context.params;
  try {
    return (await blogStore().remove(founderId(), id)) ? json({ deleted: true, id }) : fail("no_blog", `No blog post ${id}.`, 404);
  } catch (err) {
    return unavailable(err);
  }
}
