import { respond } from "@/lib/social";

/** One job, polled by the Studio page until its status is succeeded, failed or cancelled. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => ({ job: await ss.getJob(id) }));
}
