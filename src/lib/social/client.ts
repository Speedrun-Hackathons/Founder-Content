// Client for the Social Streamline REST API (docs/vendor/social-streamline-openapi.json). The spec
// documents requests only; the response shapes below were recorded on 2026-10-11 with
// scripts/record-social-streamline.ts and live in tests/fixtures/social-streamline.

import type { Platform } from "@/lib/model";
import { fromApiPlatform, toApiPlatform } from "./platforms";

export const DEFAULT_BASE_URL = "https://socialstreamline.me/api/v1";
const REQUEST_TIMEOUT_MS = 30_000;

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
  /** The platforms the post goes to, as the service lists them. */
  targets: Platform[];
  mediaUrls: string[];
  publishedAt: string | null;
  createdAt: string | null;
};

export type Caption = { platform: Platform; text: string; error: null } | { platform: Platform; text: null; error: string };

export type ProviderAccount = { id: string; platform: Platform; handle: string; connected: boolean };

export function createSocialStreamline(config: { apiKey: string; baseUrl?: string; fetch?: FetchLike }) {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const doFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init));

  async function call(method: string, path: string, body?: unknown, idempotencyKey?: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" };
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const response = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
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

    // ---- posts --------------------------------------------------------------------------------

    /** Newest first. Recorded: { data: Post[], meta: { count, nextCursor } }. */
    async listPosts(query: { limit?: number; cursor?: string; status?: string } = {}): Promise<Page<ProviderPost>> {
      const data = record(await call("GET", `/posts${qs(query)}`));
      return { items: list(data.data).map(readPost), nextCursor: str(record(data.meta).nextCursor) ?? null };
    },

    /** Edits a post that has not been sent yet. */
    updatePost: async (id: string, patch: { content?: string; mediaUrls?: string[] }) =>
      readPost(await call("PATCH", postPath(id), patch)),

    /** Removes the post from the posting service; anything already published stays on the platform. */
    deletePost: async (id: string) => {
      await call("DELETE", postPath(id));
    },

    // ---- credits, media, library ------------------------------------------------------------

    /** Recorded: { creditBalance, persistentCredits, pendingCredits, availableCredits }. */
    async credits(): Promise<Credits> {
      const c = record(await call("GET", "/credits"));
      return { available: num(c.availableCredits), balance: num(c.creditBalance), pending: num(c.pendingCredits) };
    },

    /** Who the key belongs to. Recorded: { workspaceId, email, role, scopes }. */
    async me(): Promise<{ workspaceId: string; email: string; role: string }> {
      const m = record(await call("GET", "/me"));
      return { workspaceId: str(m.workspaceId) ?? "", email: str(m.email) ?? "", role: str(m.role) ?? "" };
    },

    /** Uploads one file; the answer carries a public URL a post or a render can use. */
    async uploadMedia(file: Blob, filename: string): Promise<MediaItem> {
      const form = new FormData();
      form.append("file", file, filename);
      return readMedia(await call("POST", "/media", form, undefined, 300_000));
    },

    /** Everything uploaded, rendered or generated. Recorded: { data: LibraryItem[], meta }. */
    async library(query: { kind?: string; source?: string; subtype?: string; q?: string; cursor?: string; limit?: number } = {}): Promise<Page<LibraryItem>> {
      const data = record(await call("GET", `/library${qs(query)}`));
      return { items: list(data.data).map(readLibraryItem), nextCursor: str(record(data.meta).nextCursor) ?? null };
    },

    /** Recorded: { counts: [{ kind, source, subtype, count }], total }. */
    async libraryCounts(): Promise<{ counts: { kind: string; source: string; subtype: string | null; count: number }[]; total: number }> {
      const data = record(await call("GET", "/library/counts"));
      const counts = list(data.counts).map((c) => {
        const r = record(c);
        return { kind: str(r.kind) ?? "", source: str(r.source) ?? "", subtype: str(r.subtype) ?? null, count: num(r.count) };
      });
      return { counts, total: num(data.total) };
    },

    deleteLibraryItem: async (id: string) => {
      await call("DELETE", `/library/${encodeURIComponent(id)}`);
    },

    async libraryItemPosts(id: string): Promise<ProviderPost[]> {
      return list(record(await call("GET", `/library/${encodeURIComponent(id)}/posts`)).data).map(readPost);
    },

    // ---- video renders and jobs ---------------------------------------------------------------

    /** Queues a vertical render from uploaded clips. Spends credits; poll getJob until the status is terminal. */
    createShortVideo: async (body: ShortVideoRequest, idempotencyKey?: string) =>
      readJob(await call("POST", "/videos/short", body, idempotencyKey)),

    /** Queues a landscape render with the facecam over the desktop capture. Spends credits. */
    createLongVideo: async (body: LongVideoRequest, idempotencyKey?: string) =>
      readJob(await call("POST", "/videos/long", body, idempotencyKey)),

    getJob: async (id: string) => readJob(await call("GET", `/jobs/${encodeURIComponent(id)}`)),

    /** Recorded: { data: Job[], meta }. */
    async listJobs(query: { kind?: string; status?: string; limit?: number; cursor?: string } = {}): Promise<Page<Job>> {
      const data = record(await call("GET", `/jobs${qs(query)}`));
      return { items: list(data.data).map(readJob), nextCursor: str(record(data.meta).nextCursor) ?? null };
    },

    /** Only short and long renders can be cancelled; it releases their held credits and removes the job. */
    cancelJob: async (id: string) => {
      await call("POST", `/jobs/${encodeURIComponent(id)}/cancel`);
    },

    /** Usually answers pending; asking again with the same mediaId returns the cached record without charging twice. */
    transcribe: async (mediaUrl: string, mediaId: string) =>
      readTranscription(await call("POST", "/transcriptions", { mediaUrl, mediaId }, undefined, 60_000)),

    // ---- presets, posting defaults, webhooks --------------------------------------------------

    listPresets: async (platform?: Platform) =>
      list(record(await call("GET", `/presets${qs({ platform: platform && toApiPlatform(platform) })}`)).data).map(readPreset),
    createPreset: async (body: { name: string; platform: Platform; settings: Record<string, unknown> }) =>
      readPreset(await call("POST", "/presets", { ...body, platform: toApiPlatform(body.platform) })),
    updatePreset: async (id: string, body: { name?: string; settings?: Record<string, unknown> }) =>
      readPreset(await call("PATCH", `/presets/${encodeURIComponent(id)}`, body)),
    deletePreset: async (id: string) => {
      await call("DELETE", `/presets/${encodeURIComponent(id)}`);
    },

    listCaptionPresets: async () => list(record(await call("GET", "/caption-presets")).data).map(readPreset),
    createCaptionPreset: async (body: { name: string; settings: Record<string, unknown> }) =>
      readPreset(await call("POST", "/caption-presets", body)),
    updateCaptionPreset: async (id: string, body: { name?: string; settings?: Record<string, unknown> }) =>
      readPreset(await call("PATCH", `/caption-presets/${encodeURIComponent(id)}`, body)),
    deleteCaptionPreset: async (id: string) => {
      await call("DELETE", `/caption-presets/${encodeURIComponent(id)}`);
    },

    /** Recorded: { defaults: { crop, long, image, short, quickpost } }; absent keys mean the flow is unused. */
    postingDefaults: async () => record(record(await call("GET", "/posting-defaults")).defaults),
    setPostingDefault: async (key: string, value: Record<string, unknown>) =>
      call("PUT", `/posting-defaults/${encodeURIComponent(key)}`, { value }),

    listWebhooks: async () => list(record(await call("GET", "/webhooks")).data).map(readWebhook),
    /** The signing secret comes back once, here, and never again. */
    async createWebhook(body: { url: string; events: string[]; description?: string }): Promise<Webhook & { secret: string | null }> {
      const data = record(await call("POST", "/webhooks", body));
      const inner = record(data.data ?? data);
      return { ...readWebhook(inner), secret: str(inner.secret) ?? str(data.secret) ?? null };
    },
    updateWebhook: async (id: string, body: { url?: string; events?: string[]; description?: string; enabled?: boolean }) =>
      readWebhook(await call("PATCH", `/webhooks/${encodeURIComponent(id)}`, body)),
    deleteWebhook: async (id: string) => {
      await call("DELETE", `/webhooks/${encodeURIComponent(id)}`);
    },
    testWebhook: async (id: string) => call("POST", `/webhooks/${encodeURIComponent(id)}/test`),
    webhookDeliveries: async (id: string) => list(record(await call("GET", `/webhooks/${encodeURIComponent(id)}/deliveries?limit=20`)).data),
  };
}

export type Page<T> = { items: T[]; nextCursor: string | null };

export type Credits = { available: number; balance: number; pending: number };

export type MediaItem = { id: string; url: string; fileName: string; mimeType: string | null; fileSize: number | null };

export type LibraryItem = {
  id: string;
  title: string;
  kind: "video" | "image" | string;
  source: string;
  subtype: string | null;
  url: string;
  posterUrl: string | null;
  durationSec: number | null;
  createdAt: string | null;
};

/** queued, running, needs_action, succeeded, failed or cancelled. */
export type Job = {
  id: string;
  kind: string;
  status: string;
  detail: string | null;
  progress: number | null;
  outputUrls: string[];
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "cancelled"];

export type Clip = { facecamUrl: string; desktopUrl?: string };
type Toggle = { enabled: boolean };
export type ShortVideoRequest = {
  clips: Clip[];
  mode?: "stacked" | "facecam_only";
  captions?: Toggle & { language?: string };
  removeSilence?: Toggle;
  removeFillerWords?: Toggle;
};
export type LongVideoRequest = {
  clips: Clip[];
  facecamPosition?: string;
  facecamScale?: number;
  captions?: Toggle & { language?: string };
  removeSilence?: Toggle;
  faceTracking?: boolean;
};

export type Transcription = { id: string | null; status: string; text: string | null; error: string | null };

export type Preset = { id: string; name: string; platform: Platform | null; settings: Record<string, unknown>; createdAt: string | null };

export type Webhook = { id: string; url: string; events: string[]; description: string | null; enabled: boolean; failureCount: number | null };

function readMedia(data: unknown): MediaItem {
  const m = record(record(data).data ?? data);
  const url = str(m.url);
  if (!url) throw new SocialStreamlineError(502, "bad_response", "Social Streamline answered the upload without a URL.", null);
  return { id: str(m.id) ?? "", url, fileName: str(m.fileName) ?? "", mimeType: str(m.mimeType) ?? null, fileSize: typeof m.fileSize === "number" ? m.fileSize : null };
}

// Recorded: { id, title, kind, source, subtype, url, posterUrl, previewUrl, durationSec, aspectRatio, fileSize, createdAt }
function readLibraryItem(data: unknown): LibraryItem {
  const l = record(data);
  return {
    id: str(l.id) ?? "",
    title: str(l.title) ?? "",
    kind: str(l.kind) ?? "",
    source: str(l.source) ?? "",
    subtype: str(l.subtype) ?? null,
    url: str(l.url) ?? "",
    posterUrl: str(l.posterUrl) ?? str(l.previewUrl) ?? null,
    durationSec: typeof l.durationSec === "number" ? l.durationSec : null,
    createdAt: str(l.createdAt) ?? null,
  };
}

// Recorded: { id, kind, status, detailStatus, progress, outputUrls, sourceUrl, postId, errorMessage, createdAt, updatedAt }.
// A create call is read the same way, accepting { job: ... } or { jobId } around it.
function readJob(data: unknown): Job {
  const outer = record(data);
  const j = record(outer.job ?? outer.data ?? outer);
  const id = str(j.id) ?? str(j.jobId) ?? str(outer.jobId);
  if (!id) throw new SocialStreamlineError(502, "bad_response", "Social Streamline answered without a job id.", null);
  return {
    id,
    kind: str(j.kind) ?? "",
    status: str(j.status) ?? "queued",
    detail: str(j.detailStatus) ?? null,
    progress: typeof j.progress === "number" ? j.progress : null,
    outputUrls: list(j.outputUrls).filter((u): u is string => typeof u === "string"),
    error: str(j.errorMessage) ?? str(j.error) ?? null,
    createdAt: str(j.createdAt) ?? null,
    updatedAt: str(j.updatedAt) ?? null,
  };
}

function readTranscription(data: unknown): Transcription {
  const t = record(record(data).data ?? data);
  return {
    id: str(t.id) ?? null,
    status: str(t.status) ?? "pending",
    text: str(t.text) ?? str(t.transcript) ?? null,
    error: str(t.error) ?? str(t.errorMessage) ?? null,
  };
}

// Recorded (caption presets): { id, name, settings, createdAt }; platform presets add { platform }.
function readPreset(data: unknown): Preset {
  const p = record(record(data).data ?? data);
  return {
    id: str(p.id) ?? "",
    name: str(p.name) ?? "",
    platform: fromApiPlatform(p.platform),
    settings: record(p.settings),
    createdAt: str(p.createdAt) ?? null,
  };
}

function readWebhook(data: unknown): Webhook {
  const w = record(record(data).data ?? data);
  return {
    id: str(w.id) ?? "",
    url: str(w.url) ?? "",
    events: list(w.events).filter((e): e is string => typeof e === "string"),
    description: str(w.description) ?? null,
    enabled: w.enabled !== false,
    failureCount: typeof w.failureCount === "number" ? w.failureCount : null,
  };
}

function qs(query: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    targets: list(p.platforms).flatMap((v) => {
      const platform = fromApiPlatform(v);
      return platform ? [platform] : [];
    }),
    mediaUrls: list(p.mediaUrls).filter((u): u is string => typeof u === "string"),
    publishedAt: str(p.publishedAt) ?? null,
    createdAt: str(p.createdAt) ?? null,
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
