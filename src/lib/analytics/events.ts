import { randomUUID } from "node:crypto";
import { type EventType, isEventType } from "@/lib/model";
import { founderId, now, recordEvent } from "@/lib/store";
import {
  CUSTOM_EVENTS_HASH,
  type EventSink,
  type KeewanoPayload,
  NotAcceptedError,
  eventTypeId,
  keewanoSink,
  resetKeewanoRegistration,
  userIdFor,
} from "./keewano";
import { sanitizeEventData } from "./sanitize";

export const SEND_TIMEOUT_MS = 3000;
const OUTBOX_LIMIT = 50;
const MAX_DATA_CHARS = 2000;
const SINK_OFF = "off (no KEEWANO_API_KEY)";

export type SendError = { type: EventType; message: string; at: string };
export type SendResult = { sent: boolean; error: string | null };

type Pending = { payload: KeewanoPayload; attempts: number };

let sink: EventSink = keewanoSink;
let dataSessionId = randomUUID();
let nextBatch = 1;
let outbox: Pending[] = [];
let chain: Promise<unknown> = Promise.resolve();
let lastError: SendError | null = null;
let recordOnly = false;

export function setEventSink(next: EventSink): void {
  sink = next;
}

// Puts the real sink back and forgets the session, the unsent batches and the last error.
export function resetEventSink(): void {
  sink = keewanoSink;
  dataSessionId = randomUUID();
  nextBatch = 1;
  outbox = [];
  chain = Promise.resolve();
  lastError = null;
  resetKeewanoRegistration();
}

export function sinkLabel(): string {
  return process.env.KEEWANO_API_KEY ? "keewano" : SINK_OFF;
}

export function lastSendError(): SendError | null {
  return lastError;
}

async function sendWithTimeout(token: string, payload: KeewanoPayload): Promise<void> {
  const controller = new AbortController();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Keewano did not answer within ${SEND_TIMEOUT_MS / 1000} seconds.`));
    }, SEND_TIMEOUT_MS);
    Promise.resolve()
      .then(() => sink.send(token, payload, controller.signal))
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

// Sends the unsent batches in order. A failed batch stays at the front and is retried with the
// same session id and batch number, as Keewano's docs ask, before anything newer goes out.
async function flush(token: string, type: EventType, target: Pending): Promise<SendResult> {
  while (outbox.length > 0) {
    const head = outbox[0];
    try {
      await sendWithTimeout(token, head.payload);
    } catch (err) {
      if (err instanceof NotAcceptedError && head.attempts > 0) {
        // A retry of a batch Keewano already took: it counts as delivered.
      } else {
        head.attempts += 1;
        const message = err instanceof Error ? err.message : String(err);
        lastError = { type, message, at: now() };
        return { sent: false, error: message };
      }
    }
    outbox.shift();
  }
  lastError = null;
  return { sent: !outbox.includes(target), error: null };
}

async function deliver(type: EventType, data: Record<string, unknown>): Promise<SendResult> {
  const token = process.env.KEEWANO_API_KEY;
  if (!token) return { sent: false, error: null };
  const text = JSON.stringify(data).slice(0, MAX_DATA_CHARS);
  const entry: Pending = {
    attempts: 0,
    payload: {
      dataSessionId,
      batch: nextBatch,
      customEventsHash: CUSTOM_EVENTS_HASH,
      sdkVersion: "server/1.0",
      userId: userIdFor(founderId()),
      events: [{ eventTypeId: eventTypeId(type), timestamp: Math.floor(Date.now() / 1000), dataType: "string", data: text }],
    },
  };
  nextBatch += 1;
  outbox.push(entry);
  if (outbox.length > OUTBOX_LIMIT) outbox.shift();
  const run = chain.then(() => flush(token, type, entry));
  chain = run.catch(() => undefined);
  return run;
}

// Records an event in the store and sends it to Keewano when KEEWANO_API_KEY is set.
// It never throws: a failed send is kept as the last send error for /api/events.
export async function trackWithResult(type: EventType, data: Record<string, unknown>): Promise<SendResult> {
  const clean = sanitizeEventData(data);
  recordOnly = true;
  try {
    recordEvent(type, clean);
  } finally {
    recordOnly = false;
  }
  return deliver(type, clean);
}

// Lane C routes call this instead of recordEvent.
export async function track(type: EventType, data: Record<string, unknown>): Promise<void> {
  await trackWithResult(type, data);
}

// For store.recordEvent: events other lanes record directly still reach Keewano.
// track records its own event, so it is not forwarded twice.
export function forwardEvent(type: string, data: Record<string, unknown>): void {
  if (recordOnly) return;
  if (!isEventType(type)) return;
  void deliver(type, sanitizeEventData(data));
}
