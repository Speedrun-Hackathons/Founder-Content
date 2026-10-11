// The Calendar reads the posting service's own post list, so it shows every post in the workspace
// (made here or in Social Streamline) and survives a restart of this site's in-memory store.

import { fail } from "@/lib/http";
import { respond } from "@/lib/social";
import { calendarEntries } from "@/lib/social/calendar";

const MAX_PAGES = 5;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = Date.parse(params.get("from") ?? "");
  const to = Date.parse(params.get("to") ?? "");
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return fail("bad_range", "Give from and to as ISO date-times, with to after from.", 422);
  if (to - from > 62 * 24 * 3600 * 1000) return fail("bad_range", "Ask for at most two months at a time.", 422);

  return respond(async (ss) => {
    const posts = [];
    let cursor: string | undefined;
    // Newest first: stop once a page is entirely older than the range.
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await ss.listPosts({ limit: 100, cursor });
      posts.push(...result.items);
      const oldest = result.items.at(-1);
      const oldestTime = oldest ? Date.parse(oldest.scheduledFor ?? oldest.publishedAt ?? oldest.createdAt ?? "") : NaN;
      if (!result.nextCursor || (!Number.isNaN(oldestTime) && oldestTime < from && !result.items.some((p) => p.status === "scheduled"))) break;
      cursor = result.nextCursor;
    }
    return { entries: calendarEntries(posts, from, to) };
  });
}
