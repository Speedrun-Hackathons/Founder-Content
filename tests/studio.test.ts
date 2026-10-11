import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/company/route";
import { PUT as putBrief } from "@/app/api/brief/route";
import { POST as postCaptions } from "@/app/api/posts/captions/route";
import { DELETE as deletePost, PATCH as patchPost } from "@/app/api/posts/[id]/route";
import { POST as postPublish } from "@/app/api/posts/[id]/publish/route";
import { GET as getMe } from "@/app/api/social/me/route";
import { POST as postMedia } from "@/app/api/social/media/route";
import { GET as getLibrary } from "@/app/api/social/library/route";
import { POST as postVideo } from "@/app/api/social/videos/route";
import { GET as getJob } from "@/app/api/social/jobs/[id]/route";
import { POST as cancelJob } from "@/app/api/social/jobs/[id]/cancel/route";
import { POST as postTranscription } from "@/app/api/social/transcriptions/route";
import { GET as getPresets, POST as postPreset } from "@/app/api/social/presets/route";
import { PATCH as patchPreset } from "@/app/api/social/presets/[id]/route";
import { GET as getDefaults, PUT as putDefault } from "@/app/api/social/posting-defaults/route";
import { GET as getWebhooks, POST as postWebhook } from "@/app/api/social/webhooks/route";
import { POST as testWebhook } from "@/app/api/social/webhooks/[id]/test/route";
import { GET as getCalendar } from "@/app/api/social/calendar/route";
import { installFakeContent, resetContent } from "@/lib/content/testing";
import { resetSocialStreamline, setSocialStreamline } from "@/lib/social";
import { getState, resetStore } from "@/lib/store";
import { fakeSocialStreamline } from "./fakes/social-streamline";

function send(method: string, path: string, body?: unknown): Request {
  return new Request(`http://test${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let fake: ReturnType<typeof fakeSocialStreamline>;

async function approvedBrief() {
  await postCompany(send("POST", "/api/company", { url: "https://example.com" }));
  await putBrief(send("PUT", "/api/brief", { approved: true }));
}

beforeEach(() => {
  resetStore();
  installFakeContent();
  fake = fakeSocialStreamline();
  setSocialStreamline(fake.client);
});

afterEach(() => {
  resetContent();
  resetSocialStreamline();
});

describe("editing and deleting drafts", () => {
  it("edits a draft's text here and in the posting service, and refuses once it is published", async () => {
    await approvedBrief();
    const draft = (await (await postCaptions(send("POST", "/api/posts/captions", { platforms: ["linkedin"] }))).json()).results[0].post;

    const res = await patchPost(send("PATCH", "/x", { text: "Shorter and sharper." }), params(draft.id));
    expect(res.status).toBe(200);
    expect((await res.json()).post.text).toBe("Shorter and sharper.");
    expect(fake.posts.get(draft.providerPostId)!.content).toBe("Shorter and sharper.");

    await postPublish(new Request("http://test"), params(draft.id));
    expect((await patchPost(send("PATCH", "/x", { text: "Too late." }), params(draft.id))).status).toBe(409);
  });

  it("deletes a draft in both places", async () => {
    await approvedBrief();
    const draft = (await (await postCaptions(send("POST", "/api/posts/captions", { platforms: ["x"] }))).json()).results[0].post;
    const res = await deletePost(send("DELETE", "/x"), params(draft.id));
    expect(res.status).toBe(200);
    expect(getState().posts).toHaveLength(0);
    expect(fake.posts.has(draft.providerPostId)).toBe(false);
  });
});

describe("workspace, media and library", () => {
  it("reads the connected workspace and its credits", async () => {
    const body = await (await getMe()).json();
    expect(body).toEqual({ email: "founder@example.com", role: "owner", credits: { available: 120, balance: 120, pending: 0 } });
  });

  it("uploads a video and refuses a file that is not media", async () => {
    const form = new FormData();
    form.append("file", new File(["video"], "take-1.mp4", { type: "video/mp4" }));
    const res = await postMedia(new Request("http://test/api/social/media", { method: "POST", body: form }));
    expect(res.status).toBe(201);
    expect((await res.json()).url).toMatch(/^https:\/\/cdn\.example\/media_\d+\/take-1\.mp4$/);

    const bad = new FormData();
    bad.append("file", new File(["x"], "notes.zip", { type: "application/zip" }));
    expect((await postMedia(new Request("http://test", { method: "POST", body: bad }))).status).toBe(422);
  });

  it("lists the library with its counts", async () => {
    const body = await (await getLibrary(new Request("http://test/api/social/library?kind=video"))).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["facecam-take-2.mp4", "product-shot.jpeg"]);
    expect(body.counts.total).toBe(2);
    expect(fake.calls.find((c) => c.path === "/library")).toBeTruthy();
  });
});

describe("video renders", () => {
  const clip = { facecamUrl: "https://cdn.example/face.mp4" };

  it("queues a short render, then polls it to succeeded with its output", async () => {
    const res = await postVideo(send("POST", "/api/social/videos", { format: "short", clips: [clip], captions: true }));
    expect(res.status).toBe(201);
    const { job } = await res.json();
    expect(job).toMatchObject({ kind: "short_video", status: "queued" });
    const sent = fake.calls.find((c) => c.path === "/videos/short")!;
    expect(sent.body).toMatchObject({ clips: [clip], mode: "facecam_only", captions: { enabled: true } });
    expect(sent.headers["Idempotency-Key"]).toMatch(/^render:[0-9a-f-]{36}$/);

    expect((await (await getJob(send("GET", "/x"), params(job.id))).json()).job.status).toBe("queued");
    const done = (await (await getJob(send("GET", "/x"), params(job.id))).json()).job;
    expect(done).toMatchObject({ status: "succeeded", outputUrls: [`https://cdn.example/${job.id}.mp4`] });
  });

  it("queues a long render with the facecam placement", async () => {
    await postVideo(send("POST", "/x", { format: "long", clips: [{ ...clip, desktopUrl: "https://cdn.example/screen.mp4" }], facecamPosition: "upper_left", facecamScale: 30 }));
    expect(fake.calls.find((c) => c.path === "/videos/long")!.body).toMatchObject({ facecamPosition: "upper_left", facecamScale: 30 });
  });

  it("refuses bad clips and an empty credit balance before spending anything", async () => {
    expect((await postVideo(send("POST", "/x", { format: "square", clips: [clip] }))).status).toBe(422);
    expect((await postVideo(send("POST", "/x", { format: "short", clips: [{ facecamUrl: "http://insecure.example/a.mp4" }] }))).status).toBe(422);
    expect((await postVideo(send("POST", "/x", { format: "short", mode: "stacked", clips: [clip] }))).status).toBe(422);
    fake.state.credits = 0;
    const res = await postVideo(send("POST", "/x", { format: "short", clips: [clip] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("no_credits");
    expect(fake.calls.some((c) => c.path.startsWith("/videos"))).toBe(false);
  });

  it("cancels a render", async () => {
    const { job } = await (await postVideo(send("POST", "/x", { format: "short", clips: [clip] }))).json();
    expect((await cancelJob(send("POST", "/x"), params(job.id))).status).toBe(200);
    expect(fake.jobs.has(job.id)).toBe(false);
  });
});

describe("captions from a video", () => {
  it("transcribes with a stable media id, then drafts each Platform with the video attached", async () => {
    await approvedBrief();
    const videoUrl = "https://cdn.example/job_1.mp4";
    const first = await (await postTranscription(send("POST", "/x", { mediaUrl: videoUrl }))).json();
    await postTranscription(send("POST", "/x", { mediaUrl: videoUrl }));
    const ids = fake.calls.filter((c) => c.path === "/transcriptions").map((c) => c.body.mediaId);
    expect(ids[0]).toBe(ids[1]);
    expect(first.transcription).toMatchObject({ status: "completed", text: "Today I show how we cut editing time in half." });

    const res = await postCaptions(send("POST", "/x", { platforms: ["tiktok", "youtube"], mediaUrl: videoUrl, transcript: first.transcription.text }));
    const body = await res.json();
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(body.results[0].post.mediaUrls).toEqual([videoUrl]);
    expect(fake.calls.filter((c) => c.method === "POST" && c.path === "/posts").map((c) => c.body.mediaUrls)).toEqual([[videoUrl], [videoUrl]]);
    expect(fake.calls.find((c) => c.path === "/content/generate")!.body.transcript).toContain("Video transcript:\nToday I show how we cut editing time in half.");
  });

  it("refuses a video that is not at a public https URL", async () => {
    await approvedBrief();
    expect((await postCaptions(send("POST", "/x", { platforms: ["tiktok"], mediaUrl: "file:///C:/clip.mp4" }))).status).toBe(422);
  });
});

describe("presets, posting defaults and webhooks", () => {
  it("creates and edits a caption preset and a platform preset", async () => {
    const caption = (await (await postPreset(send("POST", "/x", { kind: "caption", name: "Bold yellow", settings: { word_color: "#FFFF00" } }))).json()).preset;
    const platform = (await (await postPreset(send("POST", "/x", { name: "YouTube public", platform: "youtube", settings: { visibility: "public" } }))).json()).preset;
    expect(platform.platform).toBe("youtube");
    await patchPreset(new Request("http://test/api/social/presets/x?kind=caption", { method: "PATCH", body: JSON.stringify({ name: "Bold blue" }) }), params(caption.id));
    const listed = (await (await getPresets(new Request("http://test/api/social/presets?kind=caption"))).json()).presets;
    expect(listed.map((p: { name: string }) => p.name)).toEqual(["Bold blue"]);
    expect((await postPreset(send("POST", "/x", { name: "", settings: {} }))).status).toBe(422);
    expect((await postPreset(send("POST", "/x", { name: "No platform", settings: {} }))).status).toBe(422);
  });

  it("reads and sets posting defaults for a known flow only", async () => {
    expect((await (await getDefaults()).json()).defaults.short).toEqual({ captions: { enabled: false } });
    expect((await putDefault(send("PUT", "/x", { key: "short", value: { captions: { enabled: true } } }))).status).toBe(200);
    expect(fake.calls.find((c) => c.method === "PUT")!.path).toBe("/posting-defaults/short");
    expect((await putDefault(send("PUT", "/x", { key: "everything", value: {} }))).status).toBe(422);
  });

  it("registers a webhook, shows its secret once, and sends a test", async () => {
    const res = await postWebhook(send("POST", "/x", { url: "https://socialcofounder.com/hooks/ss", events: ["post.published", "post.failed"] }));
    const { webhook } = await res.json();
    expect(webhook.secret).toBe("whsec_shown_once");
    const listed = (await (await getWebhooks()).json()).webhooks;
    expect(listed[0]).not.toHaveProperty("secret");
    expect((await testWebhook(send("POST", "/x"), params(webhook.id))).status).toBe(200);
    expect((await postWebhook(send("POST", "/x", { url: "http://insecure.example", events: ["*"] }))).status).toBe(422);
  });
});

describe("calendar", () => {
  it("lists scheduled and published posts in the range, marks the site's own, and leaves drafts out", async () => {
    await approvedBrief();
    const results = (await (await postCaptions(send("POST", "/x", { platforms: ["linkedin", "x", "threads"] }))).json()).results;
    const [linkedin, x] = results.map((r: { post: { id: string; providerPostId: string } }) => r.post);
    Object.assign(fake.posts.get(linkedin.providerPostId)!, { status: "scheduled", scheduledFor: "2026-10-20T16:00:00.000Z" });
    Object.assign(fake.posts.get(x.providerPostId)!, { status: "published", publishedAt: "2026-10-05T09:00:00.000Z" });

    const res = await getCalendar(new Request("http://test/api/social/calendar?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z"));
    const { entries } = await res.json();
    expect(entries.map((e: { postId: string; status: string }) => [e.postId, e.status])).toEqual([
      [x.id, "published"],
      [linkedin.id, "scheduled"],
    ]);

    const november = await (await getCalendar(new Request("http://test/api/social/calendar?from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z"))).json();
    expect(november.entries).toEqual([]);
    expect((await getCalendar(new Request("http://test/api/social/calendar?from=nope&to=2026-12-01"))).status).toBe(422);
  });
});
