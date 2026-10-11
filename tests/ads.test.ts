import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postCompany } from "@/app/api/company/route";
import { PUT as putBrief } from "@/app/api/brief/route";
import { POST as postRuns } from "@/app/api/runs/route";
import { GET as getAds } from "@/app/api/ads/route";
import { POST as postWinner } from "@/app/api/ads/[id]/winner/route";
import { GET as getMedia } from "@/app/api/ads/media/[file]/route";
import { GET as getEvents } from "@/app/api/events/route";
import { POST as postPosts } from "@/app/api/posts/route";
import { POST as postSchedule } from "@/app/api/posts/[id]/schedule/route";
import { POST as postPublish } from "@/app/api/posts/[id]/publish/route";
import { fileImageStore, resetImageStore } from "@/lib/ads/media";
import { type FakeAdsAI, installFakeAds, PNG, resetAds } from "@/lib/ads/testing";
import { setSocialStreamlineForTests } from "@/lib/social";
import { getState, resetStore } from "@/lib/store";
import { fakeSocialStreamline } from "./fakes/social-streamline";

type AdBody = { id: string; platform: string; winnerVariantId: string | null; variants: { id: string; label: string }[] };

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

function params<T>(value: T) {
  return { params: Promise.resolve(value) };
}

async function runAds(platforms: string[]): Promise<{ runId: string; ads: AdBody[] }> {
  await postCompany(post("/api/company", { url: "https://acme.com" }));
  await putBrief(put("/api/brief", { approved: true }));
  const body = await (await postRuns(post("/api/runs", { platforms }))).json();
  return { runId: body.run.id, ads: body.ads };
}

function pick(ad: AdBody, variantId: string) {
  return postWinner(post(`/api/ads/${ad.id}/winner`, { variantId }), params({ id: ad.id }));
}

let ai: FakeAdsAI;

beforeEach(() => {
  resetStore();
  ai = installFakeAds().ai;
  setSocialStreamlineForTests(fakeSocialStreamline().client);
});

afterEach(() => {
  setSocialStreamlineForTests(null);
  resetAds();
  vi.unstubAllEnvs();
});

describe("GET /api/ads", () => {
  it("returns the Ads and failures of the Run asked for", async () => {
    ai.textErrors.set("facebook", "boom");
    const first = await runAds(["x", "facebook"]);
    const second = (await (await postRuns(post("/api/runs", { platforms: ["threads", "tiktok"] }))).json()).run.id;
    const one = await (await getAds(new Request(`http://test/api/ads?runId=${first.runId}`))).json();
    expect(one.ads.map((ad: AdBody) => ad.platform)).toEqual(["x"]);
    expect(one.failures).toEqual([{ runId: first.runId, platform: "facebook", error: "boom" }]);
    const all = await (await getAds(new Request("http://test/api/ads"))).json();
    expect(all.ads.map((ad: AdBody) => ad.platform)).toEqual(["x", "threads"]);
    expect(all.failures.map((f: { runId: string }) => f.runId)).toEqual([first.runId, second]);
    expect(all.failures[1].platform).toBe("tiktok");
  });
});

describe("POST /api/ads/{id}/winner", () => {
  it("saves the Winner, lets it change, and records winner_picked per pick", async () => {
    const { ads } = await runAds(["instagram"]);
    const [ad] = ads;
    const first = await pick(ad, ad.variants[0].id);
    expect(first.status).toBe(200);
    expect((await first.json()).ad.winnerVariantId).toBe(ad.variants[0].id);
    const second = await pick(ad, ad.variants[1].id);
    expect((await second.json()).ad.winnerVariantId).toBe(ad.variants[1].id);
    expect(getState().ads[0].winnerVariantId).toBe(ad.variants[1].id);
    const events = (await (await getEvents()).json()).events as { type: string; data: unknown }[];
    expect(events.filter((e) => e.type === "winner_picked").map((e) => e.data)).toEqual([
      { adId: ad.id, variantId: ad.variants[0].id },
      { adId: ad.id, variantId: ad.variants[1].id },
    ]);
  });

  it("keeps the existing refusals", async () => {
    const { ads } = await runAds(["x", "facebook"]);
    const [x, facebook] = ads;
    expect((await pick(x, "")).status).toBe(422);
    expect((await pick(x, facebook.variants[0].id)).status).toBe(422);
    const missing = await postWinner(post("/api/ads/nope/winner", { variantId: "v" }), params({ id: "nope" }));
    expect(missing.status).toBe(404);
  });

  it("refuses a new pick once a Post of the Ad is scheduled, and while still a draft allows it", async () => {
    const { ads } = await runAds(["x"]);
    const [ad] = ads;
    expect((await pick(ad, ad.variants[0].id)).status).toBe(200);
    const draft = (await (await postPosts(post("/api/posts", { variantId: ad.variants[0].id }))).json()).post;
    expect((await pick(ad, ad.variants[1].id)).status).toBe(200);
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    await postSchedule(post(`/api/posts/${draft.id}/schedule`, { scheduledFor: future }), params({ id: draft.id }));
    const locked = await pick(ad, ad.variants[0].id);
    expect(locked.status).toBe(409);
    const body = await locked.json();
    expect(body.error).toBe("winner_locked");
    expect(body.message).toContain(draft.id);
    expect(getState().ads[0].winnerVariantId).toBe(ad.variants[1].id);
    const picks = (await (await getEvents()).json()).events.filter((e: { type: string }) => e.type === "winner_picked");
    expect(picks).toHaveLength(2);
  });

  it("refuses a new pick once a Post of the Ad is published", async () => {
    const { ads } = await runAds(["x"]);
    const [ad] = ads;
    const draft = (await (await postPosts(post("/api/posts", { variantId: ad.variants[1].id }))).json()).post;
    await postPublish(new Request("http://test"), params({ id: draft.id }));
    expect((await pick(ad, ad.variants[0].id)).status).toBe(409);
  });
});

describe("GET /api/ads/media/{file}", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "fc-media-"));
    vi.stubEnv("MEDIA_DIR", dir);
    resetImageStore();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function media(file: string) {
    return getMedia(new Request(`http://test/api/ads/media/${encodeURIComponent(file)}`), params({ file }));
  }

  it("serves a stored image as a cacheable PNG", async () => {
    const url = await fileImageStore.save(PNG, "https://founder.example/");
    expect(url).toMatch(/^https:\/\/founder\.example\/api\/ads\/media\/[a-f0-9]{32}\.png$/);
    const res = await media(url.split("/").pop()!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("refuses names outside the media folder and unknown files with 404", async () => {
    await writeFile(path.join(dir, "..", "secret.png"), "nope");
    for (const name of ["../secret.png", "..%2Fsecret.png", "a/b.png", "x.txt", ".png", "a.png.exe"]) {
      const res = await media(name);
      expect(res.status, name).toBe(404);
      expect((await res.json()).error).toBe("no_media");
    }
    expect((await media("abc123.png")).status).toBe(404);
    await rm(path.join(dir, "..", "secret.png"), { force: true });
  });
});
