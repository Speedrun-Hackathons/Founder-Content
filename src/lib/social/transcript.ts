import type { Document, Voice } from "@/lib/model";

const DOCUMENT_CONTEXT_CHARS = 4_000;
const BLOG_CHARS = 8_000;

export type CaptionSource = {
  brief: string;
  voice: Voice | null;
  documents?: Document[];
  /** The transcript of a video the posts go with. */
  video?: string;
  /** A blog post the posts promote, with the public link to it if there is one. */
  blog?: { title: string; markdown: string; link?: string };
};

/**
 * The posting service writes captions "in your saved voice" and has no API to set that voice, so
 * the site's Voice travels inside the transcript next to the Brief. The service needs 120+ characters.
 * A video transcript or a blog post leads when the captions are about one, and excerpts of the
 * Founder's Documents follow, so the caption writer has more than the Brief to go on.
 */
export function captionTranscript({ brief, voice, documents = [], video = "", blog }: CaptionSource): string {
  const lines: string[] = [];
  if (blog) {
    lines.push("Write one social post per platform that makes people want to read this blog post.");
    if (blog.link) lines.push(`End every post with this link: ${blog.link}`);
    lines.push("", `Blog post: ${blog.title}`, blog.markdown.slice(0, BLOG_CHARS), "", "About the company:", brief.trim());
  } else if (video) {
    lines.push("Write one social post per platform to go with this video, about this company.", "", "Video transcript:", video, "", "Brief:", brief.trim());
  } else {
    lines.push("Write one social post per platform about this company.", "", "Brief:", brief.trim());
  }
  if (voice) {
    lines.push("", "Voice. Follow these exactly:", `Tone: ${voice.tone}.`);
    for (const rule of voice.rules) lines.push(`- ${rule}`);
    if (voice.bannedWords.length > 0) lines.push(`Never use these words: ${voice.bannedWords.join(", ")}.`);
  }
  let budget = DOCUMENT_CONTEXT_CHARS;
  for (const doc of documents) {
    const excerpt = doc.text.trim().slice(0, budget);
    if (!excerpt) continue;
    if (budget === DOCUMENT_CONTEXT_CHARS) lines.push("", "Background from the company's documents. Use only these facts; do not quote them:");
    lines.push(`[${doc.filename}] ${excerpt}`);
    budget -= excerpt.length;
    if (budget <= 0) break;
  }
  return lines.join("\n");
}
