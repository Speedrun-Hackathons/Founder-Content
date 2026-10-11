// Writes a blog post from the approved Brief, the Voice and the Documents, through OpenAI with a
// strict JSON schema. Same call style as the Brief writer in ./ai.ts.

import type { Document, Voice } from "@/lib/model";
import { callOpenAI, textModel } from "./ai";

export const BLOG_LENGTHS = { short: 700, standard: 1200, long: 2000 } as const;
export type BlogLength = keyof typeof BLOG_LENGTHS;

export type BlogRequest = {
  company: { name: string; url: string };
  brief: string;
  voice: Voice | null;
  documents: Document[];
  /** What the post is about; empty lets the writer pick from the Brief. */
  topic: string;
  /** A search phrase to use in the title, a heading and the opening, if given. */
  keyword: string;
  length: BlogLength;
  /** Titles already written, so a new post takes a different angle. */
  avoidTitles: string[];
  feedback: string | null;
};

export type BlogDraft = { title: string; slug: string; metaDescription: string; tags: string[]; markdown: string };

export interface BlogAI {
  writeBlog(request: BlogRequest): Promise<BlogDraft>;
}

const MAX_DOCUMENT_CHARS = 6_000;

const blogSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "slug", "metaDescription", "tags", "markdown"],
  properties: {
    title: { type: "string", description: "Under 70 characters; specific, no clickbait." },
    slug: { type: "string", description: "lowercase-words-with-hyphens, under 60 characters." },
    metaDescription: { type: "string", description: "One sentence under 155 characters for search results." },
    tags: { type: "array", items: { type: "string" }, description: "Three to six short topic tags." },
    markdown: {
      type: "string",
      description: "The full post in Markdown: an opening paragraph, ## section headings, short paragraphs, lists where they help, and a closing call to action. No H1; the title is separate.",
    },
  },
};

function systemPrompt(): string {
  return [
    "You write blog posts for a small company's own blog.",
    "Use only facts found in the Brief and the documents: never invent customers, numbers, quotes, prices or results.",
    "Follow the Voice exactly: its tone, every rule, and never use a banned word in any form.",
    "Write for a reader who has the problem the product solves; teach something useful before mentioning the product.",
    "Keep paragraphs short. End with one concrete call to action that points to the company's site.",
  ].join(" ");
}

export function blogPrompt(request: BlogRequest): string {
  const { voice } = request;
  const lines = [
    `Company: ${request.company.name} (${request.company.url})`,
    `Brief:\n${request.brief}`,
    `Voice tone: ${voice?.tone ?? "plain and direct"}`,
    `Voice rules:\n${voice?.rules.map((r) => `- ${r}`).join("\n") || "- none"}`,
    `Banned words: ${voice?.bannedWords.join(", ") || "none"}`,
    `Topic: ${request.topic || "Choose the most useful topic for this company's customers from the Brief."}`,
    `Length: about ${BLOG_LENGTHS[request.length]} words.`,
  ];
  if (request.keyword) lines.push(`Search keyword: "${request.keyword}". Use it naturally in the title, one heading and the first paragraph.`);
  if (request.avoidTitles.length > 0) lines.push(`Already published, so take a different angle:\n${request.avoidTitles.map((t) => `- ${t}`).join("\n")}`);
  let budget = MAX_DOCUMENT_CHARS;
  for (const doc of request.documents) {
    const text = doc.text.trim().slice(0, budget);
    if (!text) continue;
    lines.push(`Document "${doc.filename}":\n${text}`);
    budget -= text.length;
    if (budget <= 0) break;
  }
  if (request.feedback) lines.push(`Your last answer was rejected: ${request.feedback} Fix this.`);
  return lines.join("\n\n");
}

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function parseBlog(data: Record<string, unknown>): BlogDraft {
  const message = (data.choices as { message?: { content?: string | null; refusal?: string | null } }[] | undefined)?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI declined to write the post: ${message.refusal}`);
  if (!message?.content) throw new Error("OpenAI returned no blog post.");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    throw new Error("OpenAI returned a blog post that is not valid JSON.");
  }
  const { title, slug, metaDescription, tags, markdown } = parsed;
  if (typeof title !== "string" || typeof markdown !== "string" || typeof metaDescription !== "string" || !Array.isArray(tags)) {
    throw new Error("OpenAI returned a blog post in an unexpected shape.");
  }
  return {
    title: title.trim(),
    slug: toSlug(typeof slug === "string" && slug ? slug : title),
    metaDescription: metaDescription.trim(),
    tags: tags.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()),
    markdown: markdown.trim(),
  };
}

export const openAIBlog: BlogAI = {
  async writeBlog(request) {
    const data = await callOpenAI(
      {
        model: textModel(),
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: blogPrompt(request) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "blog_post", strict: true, schema: blogSchema } },
      },
      180_000,
    );
    return parseBlog(data);
  },
};

let current: BlogAI = openAIBlog;

export function blogAI(): BlogAI {
  return current;
}

export function setBlogAI(ai: BlogAI): void {
  current = ai;
}

export function resetBlogAI(): void {
  current = openAIBlog;
}
