import type { Document, Voice } from "@/lib/model";

const DOCUMENT_CONTEXT_CHARS = 4_000;

/**
 * The posting service writes captions "in your saved voice" and has no API to set that voice, so
 * the site's Voice travels inside the transcript next to the Brief. The service needs 120+ characters.
 * Excerpts of the Founder's Documents follow, so the caption writer has more than the Brief to go on.
 */
export function captionTranscript(brief: string, voice: Voice | null, video = "", documents: Document[] = []): string {
  const lines = video
    ? ["Write one social post per platform to go with this video, about this company.", "", "Video transcript:", video, "", "Brief:", brief.trim()]
    : ["Write one social post per platform about this company.", "", "Brief:", brief.trim()];
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
