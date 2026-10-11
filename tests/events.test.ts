import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getEvents, POST as postEvents } from "@/app/api/events/route";
import { SEND_TIMEOUT_MS, resetEventSink, setEventSink, track } from "@/lib/analytics/events";
import { type EventSink, type KeewanoPayload, eventTypeId } from "@/lib/analytics/keewano";
import { EVENT_TYPES } from "@/lib/model";
import { resetStore } from "@/lib/store";

type Sent = { token: string; payload: KeewanoPayload };

function fakeSink(): { sink: EventSink; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    sink: {
      async send(token, payload) {
        sent.push({ token, payload });
      },
    },
  };
}

function post(body: unknown): Request {
  return new Request("http://test/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetStore();
  resetEventSink();
  vi.stubEnv("KEEWANO_API_KEY", "test-key");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetEventSink();
});

describe("track", () => {
  it("records the event and sends it once to the sink with the token and Keewano's body shape", async () => {
    const { sink, sent } = fakeSink();
    setEventSink(sink);
    await track("run_started", { runId: "run_0001" });

    const events = await (await getEvents()).json();
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ type: "run_started", data: { runId: "run_0001" } });
    expect(sent).toHaveLength(1);
    expect(sent[0].token).toBe("test-key");
    const body = sent[0].payload;
    expect(body.dataSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.batch).toBe(1);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventTypeId).toBe(eventTypeId("run_started"));
    expect(Number.isInteger(body.events[0].timestamp)).toBe(true);
    expect(JSON.parse(body.events[0].data)).toEqual({ runId: "run_0001" });
  });

  it("sends each of the five event types once, in numbered batches of one session", async () => {
    const { sink, sent } = fakeSink();
    setEventSink(sink);
    for (const type of EVENT_TYPES) await track(type, {});
    expect(sent.map((s) => s.payload.events[0].eventTypeId)).toEqual(EVENT_TYPES.map(eventTypeId));
    expect(new Set(sent.map((s) => s.payload.dataSessionId)).size).toBe(1);
    expect(sent.map((s) => s.payload.batch)).toEqual([1, 2, 3, 4, 5]);
  });

  it("only records when KEEWANO_API_KEY is unset", async () => {
    vi.stubEnv("KEEWANO_API_KEY", "");
    const { sink, sent } = fakeSink();
    setEventSink(sink);
    await track("brief_approved", {});
    expect(sent).toHaveLength(0);
    const events = await (await getEvents()).json();
    expect(events.events).toHaveLength(1);
    expect(events.sink).toBe("off (no KEEWANO_API_KEY)");
  });

  it("does not throw when the sink throws, and reports the error on GET /api/events", async () => {
    setEventSink({
      async send() {
        throw new Error("Keewano refused the events (403): bad key");
      },
    });
    await expect(track("winner_picked", { adId: "ad_1" })).resolves.toBeUndefined();
    const events = await (await getEvents()).json();
    expect(events.events).toHaveLength(1);
    expect(events.sink).toBe("keewano");
    expect(events.lastSendError).toMatchObject({ type: "winner_picked", message: "Keewano refused the events (403): bad key" });
  });

  it("gives up on a sink that never answers after the timeout", async () => {
    vi.useFakeTimers();
    let aborted = false;
    setEventSink({
      send: (_token, _payload, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    });
    const pending = track("post_published", {});
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 10);
    await expect(pending).resolves.toBeUndefined();
    expect(aborted).toBe(true);
    vi.useRealTimers();
    expect((await (await getEvents()).json()).lastSendError.message).toContain("did not answer");
  });

  it("retries a failed batch with the same batch number before sending newer events", async () => {
    const { sent } = fakeSink();
    let failNext = true;
    setEventSink({
      async send(token, payload) {
        if (failNext) {
          failNext = false;
          throw new Error("down");
        }
        sent.push({ token, payload });
      },
    });
    await track("run_started", {});
    await track("variant_generated", {});
    expect(sent.map((s) => [s.payload.batch, s.payload.events[0].eventTypeId])).toEqual([
      [1, eventTypeId("run_started")],
      [2, eventTypeId("variant_generated")],
    ]);
    expect((await (await getEvents()).json()).lastSendError).toBeNull();
  });

  it("strips emails, phone numbers and keys from what it sends", async () => {
    const { sink, sent } = fakeSink();
    setEventSink(sink);
    await track("brief_approved", {
      briefId: "brief_0001",
      note: "write to jane@example.com",
      contact: "+1 (617) 555-0142",
      tag: "sk-abcdef1234567890abcdef",
      apiKey: "anything",
      email: "jane@example.com",
      runAt: "2026-10-11T12:00:00.000Z",
      nested: { phone: "6175550142", ok: "fine", list: ["a@b.co", "keep"] },
    });
    const data = JSON.parse(sent[0].payload.events[0].data);
    expect(data).toEqual({ briefId: "brief_0001", runAt: "2026-10-11T12:00:00.000Z", nested: { ok: "fine", list: ["keep"] } });
    expect(JSON.stringify(sent[0].payload)).not.toContain("example.com");
  });
});

describe("POST /api/events", () => {
  it("reports sent true only when the send succeeded", async () => {
    const { sink, sent } = fakeSink();
    setEventSink(sink);
    const res = await postEvents(post({ type: "winner_picked", data: { adId: "ad_1" } }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ recorded: true, sent: true, sink: "keewano" });
    expect(sent).toHaveLength(1);
  });

  it("reports sent false with the reason when the send failed", async () => {
    setEventSink({
      async send() {
        throw new Error("down");
      },
    });
    const body = await (await postEvents(post({ type: "winner_picked" }))).json();
    expect(body).toMatchObject({ recorded: true, sent: false, sink: "keewano", sendError: "down" });
  });

  it("reports sent false without a key and refuses an unknown event", async () => {
    vi.stubEnv("KEEWANO_API_KEY", "");
    const body = await (await postEvents(post({ type: "winner_picked" }))).json();
    expect(body).toEqual({ recorded: true, sent: false, sink: "off (no KEEWANO_API_KEY)" });
    expect((await postEvents(post({ type: "nope" }))).status).toBe(422);
  });
});
