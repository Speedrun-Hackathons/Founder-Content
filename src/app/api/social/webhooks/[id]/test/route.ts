import { respond } from "@/lib/social";

/** Sends a synthetic post.published event, marked test: true, to the endpoint. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => ({ sent: true, result: await ss.testWebhook(id) }));
}
