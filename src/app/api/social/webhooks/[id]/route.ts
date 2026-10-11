import { fail, isResponse, readJson } from "@/lib/http";
import { respond } from "@/lib/social";

/** The endpoint's recent deliveries, newest first, with each response status and error. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => ({ deliveries: await ss.webhookDeliveries(id) }));
}

/** Edits an endpoint. Setting enabled to true also clears an automatic disable. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const patch: { url?: string; events?: string[]; description?: string; enabled?: boolean } = {};
  if (body.url !== undefined) {
    if (typeof body.url !== "string" || !body.url.startsWith("https://")) return fail("bad_url", "A webhook needs a public https URL.", 422);
    patch.url = body.url;
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) return fail("bad_events", "Choose at least one event.", 422);
    patch.events = body.events.map(String);
  }
  if (typeof body.description === "string") patch.description = body.description.slice(0, 200);
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  return respond(async (ss) => ({ webhook: await ss.updateWebhook(id, patch) }));
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => {
    await ss.deleteWebhook(id);
    return { deleted: true, id };
  });
}
