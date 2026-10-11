import { respond } from "@/lib/social";

/** Recent render jobs, newest first. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  return respond(async (ss) => ss.listJobs({ kind: params.get("kind") ?? undefined, status: params.get("status") ?? undefined, limit: 20 }));
}
