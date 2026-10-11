import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postCompany } from "@/app/api/company/route";
import { PUT as putBrief } from "@/app/api/brief/route";
import { POST as postRuns } from "@/app/api/runs/route";
import { GET as getAds } from "@/app/api/ads/route";
import { GET as getEvents } from "@/app/api/events/route";
import { resetAdsAI } from "@/lib/ads/ai";
import { resetImageStore } from "@/lib/ads/media";
import { type FakeAdsAI, installFakeAds, resetAds } from "@/lib/ads/testing";
import { installFakeContent, resetContent } from "@/lib/content/testing";
import { getState, resetStore } from "@/lib/store";

type Body = {
  run: { id: string; platforms: string[] };
  ads: {
    id: string;
    platform: string;
    variants: { id: string; label: string; angle: string; text: string; mediaKind: string; mediaUrls: string[] }[];
  }[];
  failures: { runId: string; platform: string; error: string }[];
  error?: string;
};

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

async function approvedBrief() {
  await postCompany(post("/api/company", { url: "https://acme.com", documents: [{ filename: "deck.txt", text: "We sell widgets." }] }));
  await putBrief(put("/api/brief", { approved: true }));
}

async function run(platforms: string[]): Promise<{ status: number; body: Body }> {
  const res = await postRuns(post("/api/runs", { platforms }));
  return { status: res.status, body: await res.json() };
}

function pairWith(textB: string) {
  return {
    A: { angle: "Time saved", text: "Get your week back.", imagePrompts: ["a calm desk"] },
    B: { angle: "Social proof", text: textB, imagePrompts: ["a team smiling"] },
  };
}

let ai: FakeAdsAI;

beforeEach(() => {
  resetStore();
  installFakeContent();
  ai = installFakeAds().ai;
});

afterEach(() => {
  resetContent();
  resetAds();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/runs", () => {
  it("keeps the existing refusals", async () => {
    await postCompany(post("/api/company", { url: "https://acme.com" }));
    expect((await run(["x"])).status).toBe(409);
    await putBrief(put("/api/brief", { approved: true }));
    expect((await run([])).body.error).toBe("no_platforms");
    const bad = await run(["x", "myspace"]);
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain("myspace");
    expect(getState().runs).toHaveLength(0);
    expect(ai.textCalls).toHaveLength(0);
  });

  it("makes A and B per Platform with text, angles and https images, three for a Carousel", async () => {
    await approvedBrief();
    const { status, body } = await run(["instagram", "facebook", "x"]);
    expect(status).toBe(201);
    expect(body.failures).toEqual([]);
    expect(body.ads.map((ad) => ad.platform).sort()).toEqual(["facebook", "instagram", "x"]);
    for (const ad of body.ads) {
      expect(ad.variants.map((v) => v.label)).toEqual(["A", "B"]);
      expect(ad.variants[0].angle).not.toBe(ad.variants[1].angle);
      for (const v of ad.variants) {
        expect(v.text.length).toBeGreaterThan(0);
        expect(v.mediaUrls.every((url) => url.startsWith("https://"))).toBe(true);
      }
    }
    const instagram = body.ads.find((ad) => ad.platform === "instagram")!;
    expect(instagram.variants.map((v) => v.mediaKind)).toEqual(["carousel", "carousel"]);
    expect(instagram.variants.map((v) => v.mediaUrls.length)).toEqual([3, 3]);
    const facebook = body.ads.find((ad) => ad.platform === "facebook")!;
    expect(facebook.variants.map((v) => [v.mediaKind, v.mediaUrls.length])).toEqual([["image", 1], ["image", 1]]);
    expect(getState().ads).toHaveLength(3);
    expect(getState().runs.map((r) => r.id)).toEqual([body.run.id]);
  });

  it("passes the Brief, Voice and Company to the text call", async () => {
    await approvedBrief();
    await run(["x"]);
    const [call] = ai.textCalls;
    expect(call.brief).toBe(getState().brief!.text);
    expect(call.voice.bannedWords).toEqual(getState().voice!.bannedWords);
    expect(call.company).toEqual({ name: getState().company!.name, url: getState().company!.url });
    expect(call.rule.maxChars).toBe(280);
  });

  it("reports one failing Platform next to the ones that succeeded", async () => {
    await approvedBrief();
    ai.textErrors.set("facebook", "OpenAI refused the request (429): Rate limit reached");
    const { status, body } = await run(["instagram", "facebook"]);
    expect(status).toBe(201);
    expect(body.ads.map((ad) => ad.platform)).toEqual(["instagram"]);
    expect(body.failures).toEqual([
      { runId: body.run.id, platform: "facebook", error: "OpenAI refused the request (429): Rate limit reached" },
    ]);
    const listed = await (await getAds(new Request(`http://test/api/ads?runId=${body.run.id}`))).json();
    expect(listed.ads).toHaveLength(1);
    expect(listed.failures).toEqual(body.failures);
  });

  it("fails the Platform when only Variant B's image fails", async () => {
    await approvedBrief();
    ai.imageErrors.push({ match: "x B", error: "Your request was rejected by the safety system." });
    const { body } = await run(["x", "facebook"]);
    expect(body.ads.map((ad) => ad.platform)).toEqual(["facebook"]);
    expect(body.failures).toEqual([
      { runId: body.run.id, platform: "x", error: "Your request was rejected by the safety system." },
    ]);
    expect(getState().ads.some((ad) => ad.platform === "x")).toBe(false);
  });

  it("regenerates text with a banned word once, then keeps it", async () => {
    await approvedBrief();
    ai.script("x", pairWith("A SEAMLESS way to post."));
    const { body } = await run(["x"]);
    expect(body.failures).toEqual([]);
    expect(body.ads[0].variants[1].text).not.toMatch(/seamless/i);
    const calls = ai.callsFor("x");
    expect(calls).toHaveLength(2);
    expect(calls[0].feedback).toBeNull();
    expect(calls[1].feedback).toContain("seamless");
  });

  it("does not treat part of a word as a banned word", async () => {
    await approvedBrief();
    ai.script("x", pairWith("Seamlessly is fine, seams are fine."));
    const { body } = await run(["x"]);
    expect(body.failures).toEqual([]);
    expect(ai.callsFor("x")).toHaveLength(1);
  });

  it("fails the Platform when the banned word comes back twice", async () => {
    await approvedBrief();
    const bad = pairWith("A revolutionary tool.");
    ai.script("facebook", bad, bad);
    const { body } = await run(["facebook", "x"]);
    expect(body.ads.map((ad) => ad.platform)).toEqual(["x"]);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].platform).toBe("facebook");
    expect(body.failures[0].error).toContain('banned word "revolutionary"');
    expect(ai.callsFor("facebook")).toHaveLength(2);
  });

  it("regenerates over-length text once and fails if it is still too long", async () => {
    await approvedBrief();
    const long = pairWith("a".repeat(281));
    ai.script("x", long);
    const once = await run(["x"]);
    expect(once.body.failures).toEqual([]);
    expect(ai.callsFor("x")).toHaveLength(2);
    expect(ai.callsFor("x")[1].feedback).toContain("281 characters; X allows 280");

    ai.script("x", long, long);
    const twice = await run(["x"]);
    expect(twice.body.ads).toEqual([]);
    expect(twice.body.failures[0].error).toContain("281 characters; X allows 280");
  });

  it("fails TikTok and YouTube without calling OpenAI", async () => {
    await approvedBrief();
    const { status, body } = await run(["tiktok", "youtube"]);
    expect(status).toBe(201);
    expect(body.ads).toEqual([]);
    expect(body.failures.map((f) => f.platform)).toEqual(["tiktok", "youtube"]);
    expect(body.failures[0].error).toContain("TikTok takes video only");
    expect(body.failures[1].error).toContain("YouTube takes video only");
    expect(ai.textCalls).toHaveLength(0);
    expect(ai.imageCalls).toHaveLength(0);
    expect(getState().runs).toHaveLength(1);
  });

  it("fails every Platform with a clear reason when OPENAI_API_KEY is missing", async () => {
    await approvedBrief();
    resetAdsAI();
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { status, body } = await run(["x", "facebook"]);
    expect(status).toBe(201);
    expect(body.ads).toEqual([]);
    expect(body.failures.map((f) => f.error)).toEqual(["OPENAI_API_KEY is not set.", "OPENAI_API_KEY is not set."]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("records run_started once and variant_generated once per Ad", async () => {
    await approvedBrief();
    ai.textErrors.set("facebook", "boom");
    const { body } = await run(["instagram", "facebook", "x"]);
    const events = (await (await getEvents()).json()).events as { type: string; data: Record<string, unknown> }[];
    expect(events.filter((e) => e.type === "run_started")).toEqual([
      expect.objectContaining({ data: { runId: body.run.id, platforms: ["instagram", "facebook", "x"] } }),
    ]);
    const generated = events.filter((e) => e.type === "variant_generated");
    expect(generated.map((e) => e.data)).toEqual(
      body.ads.map((ad) => ({ adId: ad.id, platform: ad.platform, variants: ad.variants.map((v) => v.id) })),
    );
  });
});

describe("the real OpenAI client and image store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "fc-media-"));
    vi.stubEnv("MEDIA_DIR", dir);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("PUBLIC_BASE_URL", "https://founder.example/");
    resetAdsAI();
    resetImageStore();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function openAIFake(textStatus = 200) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      if (url.endsWith("/chat/completions")) {
        if (textStatus !== 200) {
          return Response.json({ error: { message: "You exceeded your current quota." } }, { status: textStatus });
        }
        const pair = {
          A: { angle: "Time saved", text: "Get your week back.", imagePrompts: ["a calm desk"] },
          B: { angle: "Social proof", text: "Founders already switched.", imagePrompts: ["a team smiling"] },
        };
        return Response.json({ choices: [{ message: { content: JSON.stringify(pair), refusal: null } }] });
      }
      return Response.json({ data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] });
    });
    return calls;
  }

  it("calls OpenAI with the configured models and stores images at public https links", async () => {
    await approvedBrief();
    const calls = openAIFake();
    const { body } = await run(["x"]);
    expect(body.failures).toEqual([]);
    const text = calls.find((c) => c.url.endsWith("/chat/completions"))!;
    expect(text.body.model).toBe("gpt-5-mini");
    expect((text.body.response_format as { type: string }).type).toBe("json_schema");
    const images = calls.filter((c) => c.url.endsWith("/images/generations"));
    expect(images).toHaveLength(2);
    expect(images[0].body).toMatchObject({ model: "gpt-image-2", size: "1536x1024", quality: "low", n: 1 });
    const urls = body.ads[0].variants.flatMap((v) => v.mediaUrls);
    for (const url of urls) expect(url).toMatch(/^https:\/\/founder\.example\/api\/ads\/media\/[a-f0-9]{32}\.png$/);
    expect((await readdir(dir)).sort()).toEqual(urls.map((u) => u.split("/").pop()).sort());
  });

  it("surfaces OpenAI's own error message", async () => {
    await approvedBrief();
    openAIFake(429);
    const { body } = await run(["x"]);
    expect(body.failures[0].error).toBe("OpenAI refused the request (429): You exceeded your current quota.");
  });

  it("refuses an image quality that is not low, medium or high", async () => {
    await approvedBrief();
    openAIFake();
    vi.stubEnv("OPENAI_IMAGE_QUALITY", "ultra");
    const { body } = await run(["x"]);
    expect(body.failures[0].error).toContain('OPENAI_IMAGE_QUALITY "ultra"');
  });
});
