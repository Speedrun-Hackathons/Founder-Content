import { createHash } from "node:crypto";
import type { EventType } from "@/lib/model";

// Keewano's REST ingestion, as documented at
// https://docs.keewano.com/getting-started/connecting-to-keewano.md
// Our five events are custom events: ids start at 2000, they are registered once per process
// with POST /json/custom, and each event carries its data as a string (the data as JSON text).

export const KEEWANO_INGRESS_URL = "https://api.keewano.com/event/ingress/v1/json/in";
export const KEEWANO_CUSTOM_URL = "https://api.keewano.com/event/ingress/v1/json/custom";

export const EVENT_DEFINITIONS: { eventTypeId: number; name: string; dataType: "string"; type: EventType }[] = [
  { eventTypeId: 2000, name: "BriefApproved", dataType: "string", type: "brief_approved" },
  { eventTypeId: 2001, name: "RunStarted", dataType: "string", type: "run_started" },
  { eventTypeId: 2002, name: "VariantGenerated", dataType: "string", type: "variant_generated" },
  { eventTypeId: 2003, name: "WinnerPicked", dataType: "string", type: "winner_picked" },
  { eventTypeId: 2004, name: "PostPublished", dataType: "string", type: "post_published" },
];

export function eventTypeId(type: EventType): number {
  return EVENT_DEFINITIONS.find((d) => d.type === type)!.eventTypeId;
}

const REGISTRATION = EVENT_DEFINITIONS.map(({ eventTypeId: id, name, dataType }) => ({ eventTypeId: id, name, dataType }));

function crc32(text: string): number {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Keewano computes the hash as CRC-32 of the JSON of the event types with sorted keys, in
// Python's default format (", " and ": " separators), and never zero.
function customEventsHash(): number {
  const body = REGISTRATION.map(
    (def) =>
      "{" +
      Object.entries(def)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(", ") +
      "}",
  ).join(", ");
  return crc32(`[${body}]`) || 1;
}

export const CUSTOM_EVENTS_HASH = customEventsHash();

export type KeewanoEvent = { eventTypeId: number; timestamp: number; dataType: "string"; data: string };

export type KeewanoPayload = {
  dataSessionId: string;
  batch: number;
  customEventsHash: number;
  sdkVersion: string;
  userId: string;
  events: KeewanoEvent[];
};

// Keewano wants a UUID (or a UINT64 string) for the user. This makes a stable UUID from the
// Founder's id so no personal data is sent.
export function userIdFor(founderId: string): string {
  const bytes = createHash("sha1").update(`founder-content:${founderId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// What the site hands to a sink. Tests replace the sink with a fake.
export type EventSink = {
  send(token: string, payload: KeewanoPayload, signal: AbortSignal): Promise<void>;
};

// Keewano answered, but took none of the events (a duplicate or out-of-sequence batch).
export class NotAcceptedError extends Error {}

function shorten(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

let registered = false;

export function resetKeewanoRegistration(): void {
  registered = false;
}

async function ensureRegistered(token: string, signal: AbortSignal): Promise<void> {
  if (registered) return;
  const res = await fetch(KEEWANO_CUSTOM_URL, {
    method: "POST",
    headers: { "k-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ customEventsHash: CUSTOM_EVENTS_HASH, eventTypes: REGISTRATION }),
    signal,
  });
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`Keewano refused the event registration (${res.status}): ${shorten(await res.text())}`);
  }
  registered = true;
}

export const keewanoSink: EventSink = {
  async send(token, payload, signal) {
    await ensureRegistered(token, signal);
    const res = await fetch(KEEWANO_INGRESS_URL, {
      method: "POST",
      headers: { "k-token": token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Keewano refused the events (${res.status}): ${shorten(text)}`);
    try {
      const answer = JSON.parse(text) as { received?: number; accepted?: number };
      if (answer.accepted === 0 && (answer.received ?? payload.events.length) > 0) {
        throw new NotAcceptedError("Keewano accepted none of the events (a duplicate or out-of-sequence batch).");
      }
    } catch (err) {
      if (err instanceof NotAcceptedError) throw err;
    }
  },
};
