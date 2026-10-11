import type { Platform } from "@/lib/model";
import { getState } from "@/lib/store";
import type { ProviderPost } from "./client";

export type CalendarEntry = {
  providerPostId: string;
  /** The site's own Post id when the post was made here, else null. */
  postId: string | null;
  /** When it goes out (scheduled) or went out (published). */
  at: string;
  status: string;
  text: string;
  platforms: Platform[];
  failed: Platform[];
  error: string | null;
  mediaUrl: string | null;
  urls: string[];
};

const SERVICE_ORIGIN = "https://socialstreamline.me";

/** Scheduled and published posts whose send time falls in [from, to), oldest first. Drafts have no time and stay out. */
export function calendarEntries(posts: ProviderPost[], from: number, to: number): CalendarEntry[] {
  const ours = new Map(getState().posts.filter((p) => p.providerPostId).map((p) => [p.providerPostId!, p.id]));
  const seen = new Set<string>();
  const entries: CalendarEntry[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    const at = post.status === "scheduled" ? post.scheduledFor : (post.publishedAt ?? post.scheduledFor);
    if (!at || post.status === "draft") continue;
    const time = Date.parse(at);
    if (Number.isNaN(time) || time < from || time >= to) continue;
    const media = post.mediaUrls[0] ?? null;
    entries.push({
      providerPostId: post.id,
      postId: ours.get(post.id) ?? null,
      at,
      status: post.status,
      text: post.content,
      platforms: post.targets,
      failed: post.platforms.filter((o) => o.status === "failed").map((o) => o.platform),
      error: post.errorMessage,
      // Uploaded media is listed relative to the service, e.g. /api/gcs/file/...
      mediaUrl: media && media.startsWith("/") ? `${SERVICE_ORIGIN}${media}` : media,
      urls: post.platforms.flatMap((o) => (o.url ? [o.url] : [])),
    });
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
