// Blog posts written from the approved Brief, the Voice and the Documents. GET lists them; POST
// writes one through OpenAI, checks it against the Voice's banned words and rewrites once if any
// slipped in, then saves it.

import { fail, isResponse, json, readJson } from "@/lib/http";
import { OpenAINotConfigured } from "@/lib/content/ai";
import { ensureCompanyLoaded } from "@/lib/content/archive";
import { blogAI, BLOG_LENGTHS, type BlogDraft, type BlogLength } from "@/lib/content/blog-ai";
import { bannedWordsIn, blogStore, type BlogPost } from "@/lib/content/blogs";
import { founderId, getState, newId, now } from "@/lib/store";

export async function GET() {
  try {
    return json({ posts: await blogStore().list(founderId()), storage: blogStore().kind });
  } catch (err) {
    return fail("blogs_unavailable", `The blog posts could not be read: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  await ensureCompanyLoaded();
  const state = getState();
  if (!state.company || !state.brief) return fail("no_brief", "No Brief yet. Add the Company URL first.", 404);
  if (!state.brief.approved) {
    return fail("brief_not_approved", "The Brief is not approved. Approve it on the Company page before generating.", 409);
  }
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
  const keyword = typeof body.keyword === "string" ? body.keyword.trim().slice(0, 80) : "";
  const length = (body.length ?? "standard") as BlogLength;
  if (!(length in BLOG_LENGTHS)) return fail("bad_length", `length must be one of ${Object.keys(BLOG_LENGTHS).join(", ")}.`, 422);

  let existing: BlogPost[] = [];
  try {
    existing = await blogStore().list(founderId());
  } catch {
    // Saving below reports a database that is down; the titles only steer the angle.
  }

  const request = {
    company: { name: state.company.name, url: state.company.url },
    brief: state.brief.text,
    voice: state.voice,
    documents: state.documents,
    topic,
    keyword,
    length,
    avoidTitles: existing.slice(0, 15).map((p) => p.title),
    feedback: null as string | null,
  };

  let draft: BlogDraft;
  let warnings: string[];
  try {
    draft = await blogAI().writeBlog(request);
    warnings = bannedWordsIn(`${draft.title}\n${draft.markdown}`, state.voice);
    if (warnings.length > 0) {
      draft = await blogAI().writeBlog({ ...request, feedback: `It used banned words: ${warnings.join(", ")}.` });
      warnings = bannedWordsIn(`${draft.title}\n${draft.markdown}`, state.voice);
    }
  } catch (err) {
    if (err instanceof OpenAINotConfigured) return fail("openai_not_configured", err.message, 503);
    return fail("blog_failed", err instanceof Error ? err.message : String(err), 502);
  }

  const at = now();
  const post: BlogPost = { id: newId("blog"), companyId: state.company.id, ...draft, topic, keyword, length, warnings, createdAt: at, updatedAt: at };
  try {
    await blogStore().save(founderId(), post);
  } catch (err) {
    return fail("blog_not_saved", `The post was written but not saved: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  return json({ post }, 201);
}
