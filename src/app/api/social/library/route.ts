import { respond } from "@/lib/social";

const FILTERS = ["kind", "source", "subtype", "q", "cursor"] as const;

/** Everything uploaded, rendered or generated in the posting service, with counts on the first page. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const query: Record<string, string> = {};
  for (const key of FILTERS) {
    const value = params.get(key);
    if (value) query[key] = value;
  }
  return respond(async (ss) => {
    const [page, counts] = await Promise.all([ss.library({ ...query, limit: 24 }), query.cursor ? null : ss.libraryCounts()]);
    return { ...page, counts };
  });
}
