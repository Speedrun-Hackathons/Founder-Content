// The Calendar reads the posting service's own post list, so it shows every post in the workspace
// (made here or in Social Streamline) and survives a restart of this site's in-memory store.
// The service returns at most the newest 100 posts per list and no further pages (checked
// 2026-10-11), so scheduled and failed posts are asked for separately to always include them, and
// the answer says how far back the full list reaches.

import { fail } from "@/lib/http";
import { respond } from "@/lib/social";
import { calendarEntries } from "@/lib/social/calendar";

const LIMIT = 100;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = Date.parse(params.get("from") ?? "");
  const to = Date.parse(params.get("to") ?? "");
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return fail("bad_range", "Give from and to as ISO date-times, with to after from.", 422);
  if (to - from > 62 * 24 * 3600 * 1000) return fail("bad_range", "Ask for at most two months at a time.", 422);

  return respond(async (ss) => {
    const [all, scheduled, failed] = await Promise.all([
      ss.listPosts({ limit: LIMIT }),
      ss.listPosts({ limit: LIMIT, status: "scheduled" }),
      ss.listPosts({ limit: LIMIT, status: "failed" }),
    ]);
    const oldest = all.items.at(-1);
    const reachesBackTo = all.items.length >= LIMIT && oldest ? (oldest.publishedAt ?? oldest.createdAt) : null;
    return { entries: calendarEntries([...scheduled.items, ...failed.items, ...all.items], from, to), reachesBackTo };
  });
}
