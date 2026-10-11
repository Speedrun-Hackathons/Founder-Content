import { respond } from "@/lib/social";

/** Cancels a short or long render and releases its held credits. The job is removed. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => {
    await ss.cancelJob(id);
    return { cancelled: true, id };
  });
}
