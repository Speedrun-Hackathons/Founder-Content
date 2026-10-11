import { fail, isResponse, readJson } from "@/lib/http";
import { respond } from "@/lib/social";
import { WEBHOOK_EVENTS } from "@/lib/social/presets";

export async function GET() {
  return respond(async (ss) => ({ webhooks: await ss.listWebhooks(), events: WEBHOOK_EVENTS }));
}

/** Registers an endpoint. The signing secret is in this answer only; the service never shows it again. */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url.startsWith("https://")) return fail("bad_url", "A webhook needs a public https URL.", 422);
  const events = Array.isArray(body.events) ? body.events.filter((e): e is string => typeof e === "string") : [];
  if (events.length === 0) return fail("bad_events", `Choose at least one event: ${WEBHOOK_EVENTS.join(", ")}.`, 422);
  const description = typeof body.description === "string" ? body.description.slice(0, 200) : undefined;
  return respond(async (ss) => ({ webhook: await ss.createWebhook({ url, events, description }) }), 201);
}
