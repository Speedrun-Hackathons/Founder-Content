import type { Voice } from "@/lib/model";

/**
 * The posting service writes captions "in your saved voice" and has no API to set that voice, so
 * the site's Voice travels inside the transcript next to the Brief. The service needs 120+ characters.
 */
export function captionTranscript(brief: string, voice: Voice | null, video = ""): string {
  const lines = video
    ? ["Write one social post per platform to go with this video, about this company.", "", "Video transcript:", video, "", "Brief:", brief.trim()]
    : ["Write one social post per platform about this company.", "", "Brief:", brief.trim()];
  if (voice) {
    lines.push("", "Voice. Follow these exactly:", `Tone: ${voice.tone}.`);
    for (const rule of voice.rules) lines.push(`- ${rule}`);
    if (voice.bannedWords.length > 0) lines.push(`Never use these words: ${voice.bannedWords.join(", ")}.`);
  }
  return lines.join("\n");
}
