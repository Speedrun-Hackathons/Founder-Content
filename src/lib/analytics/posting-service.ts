import { type AnalyticsRow, PLATFORMS, type Platform, isPlatform } from "@/lib/model";
import { postAnalytics } from "@/lib/store";

// A small client for the posting service's get_analytics tool (MCP, JSON-RPC 2.0 over HTTPS,
// see docs/HANDOFF-LANE-B.md). Lane B builds the full client in src/lib/social; swap this one
// for it by implementing PostAnalyticsSource there.

export const DEFAULT_MCP_URL = "https://socialstreamline.me/mcp";
const REQUEST_TIMEOUT_MS = 10000;
const ANALYTICS_DAYS = 30;

export type PostAnalyticsSource = {
  fetchPostAnalytics(days: number): Promise<AnalyticsRow[]>;
};

type Session = { url: string; key: string; sessionId: string | null };

let session: Promise<Session> | null = null;
let nextRpcId = 1;

function shorten(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

// The service answers with JSON or with server-sent events; both carry JSON-RPC messages.
function parseMessages(contentType: string, text: string): Record<string, unknown>[] {
  const chunks = contentType.includes("text/event-stream")
    ? text
        .split(/\r?\n\r?\n/)
        .map((block) =>
          block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n"),
        )
        .filter(Boolean)
    : [text];
  const messages: Record<string, unknown>[] = [];
  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk);
      if (parsed && typeof parsed === "object") messages.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // Not JSON: ignore this chunk.
    }
  }
  return messages;
}

async function rpc(
  s: Session,
  body: Record<string, unknown>,
): Promise<{ result: Record<string, unknown> | null; sessionId: string | null; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${s.key}`,
  };
  if (s.sessionId) headers["Mcp-Session-Id"] = s.sessionId;
  const res = await fetch(s.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await res.text();
  const sessionId = res.headers.get("mcp-session-id");
  if (!res.ok) {
    if (res.status === 404 || res.status === 401) throw Object.assign(new Error(`The posting service answered ${res.status}: ${shorten(text)}`), { status: res.status });
    throw new Error(`The posting service answered ${res.status}: ${shorten(text)}`);
  }
  if (!("id" in body)) return { result: null, sessionId, status: res.status };
  const message = parseMessages(res.headers.get("content-type") ?? "", text).find((m) => m.id === body.id);
  if (!message) throw new Error("The posting service sent no answer to the request.");
  const error = message.error as { message?: string } | undefined;
  if (error) throw new Error(`The posting service refused the request: ${error.message ?? shorten(JSON.stringify(error))}`);
  return { result: (message.result as Record<string, unknown>) ?? {}, sessionId, status: res.status };
}

async function openSession(url: string, key: string): Promise<Session> {
  const s: Session = { url, key, sessionId: null };
  const init = await rpc(s, {
    jsonrpc: "2.0",
    id: nextRpcId++,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "founder-content", version: "0.1.0" } },
  });
  s.sessionId = init.sessionId;
  try {
    await rpc(s, { jsonrpc: "2.0", method: "notifications/initialized" });
  } catch {
    // The notification is best effort.
  }
  return s;
}

function getSession(url: string, key: string): Promise<Session> {
  if (!session) {
    const opening = openSession(url, key);
    session = opening;
    opening.catch(() => {
      if (session === opening) session = null;
    });
  }
  return session;
}

export function resetPostingSession(): void {
  session = null;
}

function toolText(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? (result.content as { type?: string; text?: string }[]) : [];
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

async function callTool(url: string, key: string, name: string, args: Record<string, unknown>, retry = true): Promise<unknown> {
  const s = await getSession(url, key);
  let result: Record<string, unknown> | null;
  try {
    ({ result } = await rpc(s, { jsonrpc: "2.0", id: nextRpcId++, method: "tools/call", params: { name, arguments: args } }));
  } catch (err) {
    if (retry && (err as { status?: number }).status === 404) {
      // The service forgot our session: open a new one once.
      session = null;
      return callTool(url, key, name, args, false);
    }
    throw err;
  }
  const text = toolText(result ?? {});
  if (result?.isError) throw new Error(`The posting service could not read analytics: ${shorten(text) || "no reason given"}`);
  if (result?.structuredContent !== undefined) return result.structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The posting service sent analytics that are not JSON: ${shorten(text)}`);
  }
}

// --- Mapping -----------------------------------------------------------------------------

const CONTAINER_KEYS = ["platforms", "byPlatform", "by_platform", "analytics", "data", "results", "posts", "items", "rows"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = toNumber(row[key]);
    if (n !== null) return n;
  }
  return null;
}

function toPlatform(value: unknown): Platform | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase();
  if (name === "twitter") return "x";
  return isPlatform(name) ? name : null;
}

// Finds the list of per-platform or per-post rows, wherever the service put it.
function findRows(node: unknown, depth = 0): Record<string, unknown>[] | null {
  if (Array.isArray(node)) return node.map((item) => asRecord(item) ?? {});
  const obj = asRecord(node);
  if (!obj || depth > 3) return null;
  const keys = Object.keys(obj);
  if (keys.length > 0 && keys.every((k) => toPlatform(k) !== null && asRecord(obj[k]))) {
    return keys.map((k) => ({ platform: k, ...(obj[k] as Record<string, unknown>) }));
  }
  for (const key of CONTAINER_KEYS) {
    if (Array.isArray(obj[key]) || asRecord(obj[key])) {
      const rows = findRows(obj[key], depth + 1);
      if (rows) return rows;
    }
  }
  return null;
}

export function mapAnalytics(payload: unknown): AnalyticsRow[] {
  const empty = payload === null || (Array.isArray(payload) && payload.length === 0) || (asRecord(payload) !== null && Object.keys(payload as object).length === 0);
  if (empty) return [];
  const rows = findRows(payload);
  if (!rows) throw new Error("The posting service sent analytics in a shape this site does not read.");
  const byPlatform = new Map<Platform, AnalyticsRow>();
  for (const row of rows) {
    const platform = toPlatform(row.platform ?? row.name ?? row.network ?? row.channel);
    if (!platform) continue;
    const engagements =
      pickNumber(row, ["engagements", "engagement", "totalEngagements", "total_engagements"]) ??
      ["likes", "comments", "shares", "reposts", "saves", "clicks"].reduce((sum, k) => sum + (toNumber(row[k]) ?? 0), 0);
    const total = byPlatform.get(platform) ?? { platform, posts: 0, impressions: 0, engagements: 0, standIn: false };
    total.posts += pickNumber(row, ["posts", "postCount", "post_count", "totalPosts", "total_posts", "count"]) ?? 1;
    total.impressions += pickNumber(row, ["impressions", "views", "reach", "totalImpressions", "total_impressions"]) ?? 0;
    total.engagements += engagements;
    byPlatform.set(platform, total);
  }
  if (byPlatform.size === 0 && rows.length > 0) {
    throw new Error("The posting service sent analytics in a shape this site does not read.");
  }
  return PLATFORMS.filter((p) => byPlatform.has(p)).map((p) => byPlatform.get(p)!);
}

const mcpSource: PostAnalyticsSource = {
  async fetchPostAnalytics(days) {
    const url = process.env.SOCIAL_STREAMLINE_MCP_URL || DEFAULT_MCP_URL;
    const key = process.env.SOCIAL_STREAMLINE_API_KEY ?? "";
    return mapAnalytics(await callTool(url, key, "get_analytics", { days }));
  },
};

let source: PostAnalyticsSource = mcpSource;

export function setPostAnalyticsSource(next: PostAnalyticsSource): void {
  source = next;
}

export function resetPostAnalyticsSource(): void {
  source = mcpSource;
  session = null;
}

export type PostRows = { posts: AnalyticsRow[]; postsSource: string; postsError?: string };

// Post analytics from the posting service, or the store's stand-in rows with the reason why.
export async function loadPostAnalytics(): Promise<PostRows> {
  if (!process.env.SOCIAL_STREAMLINE_API_KEY) {
    return { posts: postAnalytics(), postsSource: "store (no SOCIAL_STREAMLINE_API_KEY)" };
  }
  try {
    return { posts: await source.fetchPostAnalytics(ANALYTICS_DAYS), postsSource: "posting service" };
  } catch (err) {
    return { posts: postAnalytics(), postsSource: "store", postsError: err instanceof Error ? err.message : String(err) };
  }
}
