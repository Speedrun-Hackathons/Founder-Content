// Client for the Social Streamline REST API (docs/vendor/social-streamline-openapi.json). The spec
// documents requests only; the response shapes below were recorded on 2026-10-11 with
// scripts/record-social-streamline.ts and live in tests/fixtures/social-streamline.

import type { Platform } from "@/lib/model";
import { fromApiPlatform, toApiPlatform } from "./platforms";

export const DEFAULT_BASE_URL = "https://socialstreamline.me/api/v1";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A non-2xx answer. `message` is the service's own text, never rewritten. */
export class SocialStreamlineError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, code: string, message: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = "SocialStreamlineError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type PlatformOutcome = {
  platform: Platform;
  status: string;
  /** The platform's reason, e.g. "X rate-limited this post." */
  error: string | null;
  /** The service's advice, e.g. "Retry in a few minutes." */
  nextStep: string | null;
  url: string | null;
};

export type ProviderPost = {
  id: string;
  /** draft, scheduled, processing, needs_review, published or failed. A partly failed post reads published. */
  status: string;
  content: string;
  scheduledFor: string | null;
  /** The service's summary when a platform failed, e.g. "Failed on X: X rate-limited this post. Retry in a few minutes." */
  errorMessage: string | null;
  platforms: PlatformOutcome[];
};

export type Caption = { platform: Platform; text: string; error: null } | { platform: Platform; text: null; error: string };

export type ProviderAccount = { id: string; platform: Platform; handle: string; connected: boolean };

export function createSocialStreamline(config: { apiKey: string; baseUrl?: string; fetch?: FetchLike }) {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const doFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init));

  async function call(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const response = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {}

    if (!response.ok) {
      // The API answers { error: { code, message } }; the MCP endpoint's 401 answers { error, message }.
      const outer = record(json);
      const err = typeof outer.error === "object" ? record(outer.error) : outer;
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new SocialStreamlineError(
        response.status,
        str(err.code) ?? str(err.error) ?? `http_${response.status}`,
        str(err.message) ?? (text || `Social Streamline answered ${response.status}`),
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      );
    }
    return json;
  }

  const postPath = (id: string, action = "") => `/posts/${encodeURIComponent(id)}${action}`;

  return {
    /** One caption per platform in the workspace's saved voice. Spends credits; the transcript needs 120+ characters. */
    async generateCaptions(transcript: string, platforms: Platform[], idempotencyKey?: string): Promise<Caption[]> {
      const data = await call("POST", "/content/generate", { transcript, platforms: platforms.map(toApiPlatform) }, idempotencyKey);
      return readCaptions(data, platforms);
    },

    /** A draft; nothing is sent until schedule or publish. Media must already sit at a public https URL. */
    async createDraft(input: { content: string; platforms: Platform[]; mediaUrls?: string[] }, idempotencyKey?: string) {
      const body = {
        content: input.content,
        platforms: input.platforms.map(toApiPlatform),
        ...(input.mediaUrls?.length ? { mediaUrls: input.mediaUrls } : {}),
      };
      return readPost(await call("POST", "/posts", body, idempotencyKey));
    },

    getPost: async (id: string) => readPost(await call("GET", postPath(id))),

    schedulePost: async (id: string, scheduledFor: string, idempotencyKey?: string) =>
      readPost(await call("POST", postPath(id, "/schedule"), { scheduledFor }, idempotencyKey)),

    /** Irreversible: reaches a real audience. */
    publishPost: async (id: string, idempotencyKey?: string) =>
      readPost(await call("POST", postPath(id, "/publish"), undefined, idempotencyKey)),

    /** Re-sends only the platforms that failed, so it cannot duplicate the ones that went out. */
    retryFailedPlatforms: async (id: string, idempotencyKey?: string) =>
      readPost(await call("POST", postPath(id, "/retry-failed-platforms"), undefined, idempotencyKey)),

    async listAccounts(): Promise<ProviderAccount[]> {
      const data = record(await call("GET", "/accounts")).data;
      return (Array.isArray(data) ? data : []).flatMap((value) => {
        const a = record(value);
        const platform = fromApiPlatform(a.platform);
        const id = str(a.id);
        if (!platform || !id) return [];
        return [{ id, platform, handle: str(a.accountHandle) ?? str(a.accountName) ?? "", connected: a.connected === true && a.disabled !== true }];
      });
    },
  };
}

export type SocialStreamline = ReturnType<typeof createSocialStreamline>;

// Recorded: { id, content, platforms, status, scheduledFor, errorMessage, providerPostId,
//   platformStatuses: null | { twitter: { status, postUrl } | { status: "failed", error, nextStep, rawError, transient } } }
export function readPost(data: unknown): ProviderPost {
  const p = record(data);
  const id = str(p.id);
  if (!id) throw new SocialStreamlineError(502, "bad_response", "Social Streamline answered without a post id.", null);
  const statuses = record(p.platformStatuses);
  return {
    id,
    status: str(p.status) ?? "unknown",
    content: str(p.content) ?? "",
    scheduledFor: str(p.scheduledFor) ?? null,
    errorMessage: str(p.errorMessage) ?? null,
    platforms: Object.entries(statuses).flatMap(([key, value]) => {
      const platform = fromApiPlatform(key);
      if (!platform) return [];
      const s = record(value);
      return [{ platform, status: str(s.status) ?? "unknown", error: str(s.error) ?? null, nextStep: str(s.nextStep) ?? null, url: str(s.postUrl) ?? null }];
    }),
  };
}

// Recorded: { content: { linkedin: { content: { postText } }, twitter: { content: { tweetText } } } }; the
// text field is named per platform. A failed platform carries `error` instead of copy (per the spec).
const CAPTION_FIELDS = ["postText", "tweetText", "caption", "text", "description"];

export function readCaptions(data: unknown, requested: Platform[]): Caption[] {
  const byPlatform = new Map<Platform, Caption>();
  for (const [key, value] of Object.entries(record(record(data).content))) {
    const platform = fromApiPlatform(key);
    if (!platform) continue;
    const entry = record(value);
    const error = str(entry.error) ?? str(record(entry.error).message);
    const inner = record(entry.content);
    const text = str(entry.content) ?? CAPTION_FIELDS.map((f) => str(inner[f])).find(Boolean) ?? Object.values(inner).map(str).find(Boolean);
    byPlatform.set(platform, text && !error ? { platform, text, error: null } : { platform, text: null, error: error ?? "No caption came back for this platform." });
  }
  // Every requested platform gets an entry, so a silent omission still shows as a failure.
  return requested.map((platform) => byPlatform.get(platform) ?? { platform, text: null, error: "No caption came back for this platform." });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
