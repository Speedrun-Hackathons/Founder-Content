import { fail, isResponse, json, readJson } from "@/lib/http";
import { EVENT_TYPES, isEventType } from "@/lib/model";
import { getState, recordEvent } from "@/lib/store";

export function GET() {
  return json({ events: getState().events, sink: process.env.KEEWANO_API_KEY ? "keewano" : "off (no KEEWANO_API_KEY)" });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  if (!isEventType(body.type)) {
    return fail("bad_event", `Unknown event "${String(body.type)}". Choose from: ${EVENT_TYPES.join(", ")}.`, 422);
  }
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  recordEvent(body.type, data);
  const sent = Boolean(process.env.KEEWANO_API_KEY);
  return json({ recorded: true, sent, sink: sent ? "keewano" : "off (no KEEWANO_API_KEY)" }, 202);
}
