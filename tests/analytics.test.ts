import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getAnalytics } from "@/app/api/analytics/route";
import { mapAnalytics, resetPostAnalyticsSource, setPostAnalyticsSource } from "@/lib/analytics/posting-service";
import type { Platform } from "@/lib/model";
import { createCompany, createDraft, createRun, getState, resetStore, updateBrief } from "@/lib/store";

// Builds the Ads through the store, so these tests do not depend on how Ads are generated.
function runWithAds(platforms: Platform[]) {
  createCompany("https://example.com", []);
  updateBrief({ approved: true });
  createRun(platforms);
}

beforeEach(() => {
  resetStore();
  resetPostAnalyticsSource();
  vi.stubEnv("SOCIAL_STREAMLINE_API_KEY", "");
  vi.stubEnv("KEEWANO_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetPostAnalyticsSource();
});

describe("GET /api/analytics", () => {
  it("answers the shape before anything exists, from the store without a key", async () => {
    const body = await (await getAnalytics()).json();
    expect(body.posts).toEqual([]);
    expect(body.ads).toEqual([]);
    expect(body.adVariants).toEqual([]);
    expect(body.timeSaved.totalRuns).toBe(0);
    expect(body.postsSource).toBe("store (no SOCIAL_STREAMLINE_API_KEY)");
    expect(body.postsError).toBeUndefined();
  });

  it("uses the posting service when the key is set", async () => {
    vi.stubEnv("SOCIAL_STREAMLINE_API_KEY", "ss-key");
    const fetchPostAnalytics = vi.fn(async () => [{ platform: "x" as const, posts: 3, impressions: 900, engagements: 55, standIn: false }]);
    setPostAnalyticsSource({ fetchPostAnalytics });
    const body = await (await getAnalytics()).json();
    expect(fetchPostAnalytics).toHaveBeenCalledWith(30);
    expect(body.posts).toEqual([{ platform: "x", posts: 3, impressions: 900, engagements: 55, standIn: false }]);
    expect(body.postsSource).toBe("posting service");
    expect(body.postsError).toBeUndefined();
  });

  it("falls back to the store rows with the service's reason when the call fails", async () => {
    vi.stubEnv("SOCIAL_STREAMLINE_API_KEY", "ss-key");
    setPostAnalyticsSource({
      async fetchPostAnalytics() {
        throw new Error("The posting service answered 401: bad token");
      },
    });
    runWithAds(["threads"]);
    const adId = getState().ads[0].id;
    const draft = createDraft(getState().ads.find((a) => a.id === adId)!.variants[0].id)!;
    draft.status = "published";
    const body = await (await getAnalytics()).json();
    expect(body.postsSource).toBe("store");
    expect(body.postsError).toBe("The posting service answered 401: bad token");
    expect(body.posts[0].platform).toBe("threads");
    expect(body.posts[0].standIn).toBe(true);
  });

  it("gives every Variant stable stand-in numbers", async () => {
    runWithAds(["x", "linkedin"]);
    const first = (await (await getAnalytics()).json()).adVariants;
    const second = (await (await getAnalytics()).json()).adVariants;
    expect(first).toHaveLength(4);
    expect(second).toEqual(first);
    expect(first.map((v: { label: string }) => v.label)).toEqual(["A", "B", "A", "B"]);
    for (const row of first) {
      expect(row.standIn).toBe(true);
      expect(row.impressions).toBeGreaterThanOrEqual(400);
      expect(row.impressions).toBeLessThanOrEqual(2000);
      expect(row.clicks).toBeGreaterThanOrEqual(1);
      expect(row.clicks / row.impressions).toBeGreaterThanOrEqual(0.0095);
      expect(row.clicks / row.impressions).toBeLessThanOrEqual(0.0605);
      expect(row.clickRate).toBe(Math.round((row.clicks / row.impressions) * 10000) / 10000);
      expect(getState().ads.some((a) => a.id === row.adId && a.variants.some((v) => v.id === row.variantId))).toBe(true);
    }
  });
});

describe("mapAnalytics", () => {
  it("maps per-platform rows, aliases and string numbers", () => {
    expect(
      mapAnalytics({ platforms: [{ platform: "Twitter", posts: "2", impressions: 10, likes: 3, comments: 1 }, { platform: "bluesky", impressions: 5, engagements: 2 }] }),
    ).toEqual([
      { platform: "x", posts: 2, impressions: 10, engagements: 4, standIn: false },
      { platform: "bluesky", posts: 1, impressions: 5, engagements: 2, standIn: false },
    ]);
  });

  it("adds up per-post rows and reads a platform-keyed object", () => {
    expect(mapAnalytics([{ platform: "x", views: 10, engagement: 1 }, { platform: "x", views: 5, engagement: 2 }])).toEqual([
      { platform: "x", posts: 2, impressions: 15, engagements: 3, standIn: false },
    ]);
    expect(mapAnalytics({ instagram: { posts: 1, impressions: 7, engagements: 1 } })[0].platform).toBe("instagram");
  });

  it("returns no rows for an empty answer and refuses a shape it cannot read", () => {
    expect(mapAnalytics({})).toEqual([]);
    expect(mapAnalytics({ platforms: [] })).toEqual([]);
    expect(() => mapAnalytics({ message: "hello" })).toThrow();
    expect(() => mapAnalytics([{ foo: 1 }])).toThrow();
  });
});

describe("posting service client", () => {
  it("initializes once, calls get_analytics and reads the server-sent answer", async () => {
    vi.stubEnv("SOCIAL_STREAMLINE_API_KEY", "ss-key");
    vi.stubEnv("SOCIAL_STREAMLINE_MCP_URL", "https://posting.test/mcp");
    const calls: { headers: Record<string, string>; body: { method: string; id?: number; params?: Record<string, unknown> } }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string>; body: string }) => {
        const body = JSON.parse(init.body);
        calls.push({ headers: init.headers, body });
        if (body.method === "initialize") {
          return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} })}\n\n`, {
            headers: { "content-type": "text/event-stream", "mcp-session-id": "sess-1" },
          });
        }
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
        const analytics = { platforms: [{ platform: "x", posts: 2, impressions: 100, engagements: 9 }] };
        return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(analytics) }] } })}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        });
      }),
    );
    try {
      const first = await (await getAnalytics()).json();
      const second = await (await getAnalytics()).json();
      expect(first.posts).toEqual([{ platform: "x", posts: 2, impressions: 100, engagements: 9, standIn: false }]);
      expect(second.postsSource).toBe("posting service");
      expect(calls.filter((c) => c.body.method === "initialize")).toHaveLength(1);
      const tool = calls.filter((c) => c.body.method === "tools/call");
      expect(tool).toHaveLength(2);
      expect(tool[0].body.params).toEqual({ name: "get_analytics", arguments: { days: 30 } });
      expect(tool[0].headers.Authorization).toBe("Bearer ss-key");
      expect(tool[0].headers["Mcp-Session-Id"]).toBe("sess-1");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns the service's reason when it refuses", async () => {
    vi.stubEnv("SOCIAL_STREAMLINE_API_KEY", "ss-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid token", { status: 401 })));
    try {
      const body = await (await getAnalytics()).json();
      expect(body.postsSource).toBe("store");
      expect(body.postsError).toContain("401");
      expect(body.postsError).toContain("invalid token");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
