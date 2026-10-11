import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as getCompany, POST as postCompany } from "@/app/api/company/route";
import { GET as getBrief, PUT as putBrief } from "@/app/api/brief/route";
import { GET as getRuns, POST as postRuns } from "@/app/api/runs/route";
import { GET as getAds } from "@/app/api/ads/route";
import { POST as postWinner } from "@/app/api/ads/[id]/winner/route";
import { GET as getPosts, POST as postPosts } from "@/app/api/posts/route";
import { POST as postSchedule } from "@/app/api/posts/[id]/schedule/route";
import { POST as postPublish } from "@/app/api/posts/[id]/publish/route";
import { GET as getAccounts } from "@/app/api/accounts/route";
import { GET as getAnalytics } from "@/app/api/analytics/route";
import { GET as getEvents, POST as postEvents } from "@/app/api/events/route";
import { installFakeAds } from "@/lib/ads/testing";
import { resetSocialStreamline, setSocialStreamline } from "@/lib/social";
import { installFakeContent, resetContent } from "@/lib/content/testing";
import { resetStore } from "@/lib/store";
import { fakeSocialStreamline } from "./fakes/social-streamline";

function post(path: string, body: unknown): Request {
  return new Request(`http://test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function put(path: string, body: unknown): Request {
  return new Request(`http://test${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function approvedBrief() {
  await postCompany(post("/api/company", { url: "https://example.com", documents: [{ filename: "deck.txt", text: "We sell widgets." }] }));
  await putBrief(put("/api/brief", { approved: true }));
}

beforeEach(() => {
  resetStore();
  installFakeContent();
  installFakeAds();
  setSocialStreamline(fakeSocialStreamline().client);
});

afterEach(() => {
  resetSocialStreamline();
  resetContent();
});

describe("health", () => {
  it("answers ok with a build id", async () => {
    const body = await health().json();
    expect(body.ok).toBe(true);
    expect(typeof body.build).toBe("string");
  });
});

describe("company and brief", () => {
  it("refuses a value that is not a URL and echoes it", async () => {
    const res = await postCompany(post("/api/company", { url: "not a url" }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain("not a url");
  });

  it("creates a company with a brief and a voice", async () => {
    const res = await postCompany(post("/api/company", { url: "https://www.example.com/", documents: [] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.company.name).toBe("example");
    expect(body.brief.approved).toBe(false);
    expect(body.voice.rules.length).toBeGreaterThan(0);
    const current = await (await getCompany()).json();
    expect(current.company.id).toBe(body.company.id);
  });

  it("returns 404 for a brief before a company exists", async () => {
    expect((await getBrief()).status).toBe(404);
  });

  it("approves the brief and keeps edited text", async () => {
    await postCompany(post("/api/company", { url: "https://example.com" }));
    const res = await putBrief(put("/api/brief", { text: "Edited brief", approved: true, voice: { tone: "warm" } }));
    const body = await res.json();
    expect(body.brief.text).toBe("Edited brief");
    expect(body.brief.approved).toBe(true);
    expect(body.voice.tone).toBe("warm");
  });
});

describe("runs and ads", () => {
  it("refuses a run before the brief is approved", async () => {
    await postCompany(post("/api/company", { url: "https://example.com" }));
    const res = await postRuns(post("/api/runs", { platforms: ["instagram"] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("brief_not_approved");
  });

  it("refuses an unknown platform and names it", async () => {
    await approvedBrief();
    const res = await postRuns(post("/api/runs", { platforms: ["myspace"] }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain("myspace");
  });

  it("creates two variants per platform and records events", async () => {
    await approvedBrief();
    const res = await postRuns(post("/api/runs", { platforms: ["instagram", "facebook"] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ads).toHaveLength(2);
    expect(body.ads[0].variants.map((v: { label: string }) => v.label)).toEqual(["A", "B"]);
    const runs = await (await getRuns()).json();
    expect(runs.runs).toHaveLength(1);
    const ads = await (await getAds(new Request(`http://test/api/ads?runId=${body.run.id}`))).json();
    expect(ads.ads).toHaveLength(2);
    const events = await (await getEvents()).json();
    expect(events.events.map((e: { type: string }) => e.type)).toEqual([
      "brief_approved",
      "run_started",
      "variant_generated",
      "variant_generated",
    ]);
  });

  it("picks a winner and refuses a variant from another ad", async () => {
    await approvedBrief();
    const body = await (await postRuns(post("/api/runs", { platforms: ["instagram", "facebook"] }))).json();
    const [first, second] = body.ads;
    const ok = await postWinner(post(`/api/ads/${first.id}/winner`, { variantId: first.variants[1].id }), params(first.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ad.winnerVariantId).toBe(first.variants[1].id);
    const wrong = await postWinner(post(`/api/ads/${first.id}/winner`, { variantId: second.variants[0].id }), params(first.id));
    expect(wrong.status).toBe(422);
    const missing = await postWinner(post("/api/ads/nope/winner", { variantId: "x" }), params("nope"));
    expect(missing.status).toBe(404);
  });
});

describe("posts", () => {
  it("drafts, schedules and publishes a variant, then refuses a second publish", async () => {
    await approvedBrief();
    const run = await (await postRuns(post("/api/runs", { platforms: ["threads"] }))).json();
    const variantId = run.ads[0].variants[0].id;
    const draft = await postPosts(post("/api/posts", { variantId }));
    expect(draft.status).toBe(201);
    const postId = (await draft.json()).post.id;
    const past = await postSchedule(post(`/api/posts/${postId}/schedule`, { scheduledFor: "2000-01-01T00:00:00Z" }), params(postId));
    expect(past.status).toBe(422);
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const scheduled = await postSchedule(post(`/api/posts/${postId}/schedule`, { scheduledFor: future }), params(postId));
    expect((await scheduled.json()).post.status).toBe("scheduled");
    const published = await postPublish(new Request("http://test"), params(postId));
    expect((await published.json()).post.status).toBe("published");
    const again = await postPublish(new Request("http://test"), params(postId));
    expect(again.status).toBe(409);
    const list = await (await getPosts()).json();
    expect(list.posts[0].providerPostId).toBeTruthy();
    const analytics = await (await getAnalytics()).json();
    expect(analytics.posts[0].platform).toBe("threads");
    expect(analytics.timeSaved.totalRuns).toBe(1);
  });

  it("refuses a draft for an unknown variant", async () => {
    const res = await postPosts(post("/api/posts", { variantId: "var_none" }));
    expect(res.status).toBe(404);
  });
});

describe("accounts, analytics and events", () => {
  it("lists accounts and the platforms without a connection", async () => {
    const body = await (await getAccounts()).json();
    expect(body.accounts.length).toBeGreaterThan(0);
    expect(Array.isArray(body.missing)).toBe(true);
    expect(body.connectUrl).toContain("https://");
  });

  it("answers the analytics shape before anything exists", async () => {
    const body = await (await getAnalytics()).json();
    expect(body.posts).toEqual([]);
    expect(body.ads).toEqual([]);
    expect(body.timeSaved.surveyHoursPerWeekLow).toBe(1);
  });

  it("refuses an unknown event type and accepts a known one", async () => {
    const bad = await postEvents(post("/api/events", { type: "nope" }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).message).toContain("nope");
    const ok = await postEvents(post("/api/events", { type: "winner_picked", data: { adId: "ad_1" } }));
    expect(ok.status).toBe(202);
    expect((await ok.json()).recorded).toBe(true);
  });
});
