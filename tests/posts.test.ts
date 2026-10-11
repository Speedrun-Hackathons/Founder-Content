import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/company/route";
import { PUT as putBrief } from "@/app/api/brief/route";
import { POST as postRuns } from "@/app/api/runs/route";
import { GET as getPosts, POST as postPosts } from "@/app/api/posts/route";
import { POST as postSchedule } from "@/app/api/posts/[id]/schedule/route";
import { POST as postPublish } from "@/app/api/posts/[id]/publish/route";
import { POST as postRetry } from "@/app/api/posts/[id]/retry/route";
import { GET as getEvents } from "@/app/api/events/route";
import { installFakeAds, resetAds } from "@/lib/ads/testing";
import { setSocialStreamlineForTests } from "@/lib/social";
import { getState, resetStore } from "@/lib/store";
import { FAKE_API_KEY, fakeSocialStreamline, fixture } from "./fakes/social-streamline";

function post(path: string, body: unknown = {}): Request {
  return new Request(`http://test${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let fake: ReturnType<typeof fakeSocialStreamline>;

/** The recorded partial failure (X rate-limited), answered for the draft that was actually sent. */
function partlyFailed(call: { path: string }) {
  const recording = fixture("posts-publish.partial");
  return { ...recording, body: { ...(recording.body as object), id: call.path.split("/")[2] } };
}

async function draft(platform = "linkedin") {
  await postCompany(post("/api/company", { url: "https://example.com" }));
  await putBrief(new Request("http://test/api/brief", { method: "PUT", body: JSON.stringify({ approved: true }) }));
  const run = await (await postRuns(post("/api/runs", { platforms: [platform] }))).json();
  const variant = run.ads[0].variants[0];
  const res = await postPosts(post("/api/posts", { variantId: variant.id }));
  return { res, variant, post: (await res.clone().json()).post };
}

beforeEach(() => {
  resetStore();
  installFakeAds();
  fake = fakeSocialStreamline();
  setSocialStreamlineForTests(fake.client);
});

afterEach(() => {
  setSocialStreamlineForTests(null);
  resetAds();
});

describe("drafts from a Variant", () => {
  it("creates the draft in the posting service with the Variant's text and keeps its id", async () => {
    const { res, variant, post: created } = await draft("x");
    expect(res.status).toBe(201);
    expect(created.status).toBe("draft");
    expect(created.text).toBe(variant.text);
    expect(created.providerPostId).toBe("ss_post_1");

    const sent = fake.calls.find((c) => c.method === "POST" && c.path === "/posts")!;
    expect(sent.body).toEqual({ content: variant.text, platforms: ["twitter"], mediaUrls: variant.mediaUrls });
    expect(sent.headers["Idempotency-Key"]).toBe(`draft:${variant.id}`);
    expect(sent.headers.Authorization).toBe(`Bearer ${FAKE_API_KEY}`);
  });

  it("returns the existing draft instead of making a second one", async () => {
    const { variant, post: first } = await draft();
    const again = await postPosts(post("/api/posts", { variantId: variant.id }));
    expect(again.status).toBe(200);
    expect((await again.json()).post.id).toBe(first.id);
    expect(fake.calls.filter((c) => c.path === "/posts")).toHaveLength(1);
  });

  it("keeps nothing locally when the posting service refuses the draft", async () => {
    fake.answer("POST /posts", fixture("error-platform-constraint"));
    const { res } = await draft("instagram");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "platform_constraint", message: "Instagram needs an image or video to publish." });
    expect(getState().posts).toHaveLength(0);
  });
});

describe("schedule", () => {
  it("sends the send time and shows the status the service returns", async () => {
    const { post: created } = await draft();
    const when = new Date(Date.now() + 3600 * 1000).toISOString();
    const res = await postSchedule(post(`/api/posts/${created.id}/schedule`, { scheduledFor: when }), params(created.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.status).toBe("scheduled");
    expect(body.post.scheduledFor).toBe(when);
    const sent = fake.calls.find((c) => c.path === "/posts/ss_post_1/schedule")!;
    expect(sent.body).toEqual({ scheduledFor: when });
  });

  it("refuses a past time without calling the service", async () => {
    const { post: created } = await draft();
    const res = await postSchedule(post(`/api/posts/${created.id}/schedule`, { scheduledFor: "2000-01-01T00:00:00Z" }), params(created.id));
    expect(res.status).toBe(422);
    expect(fake.calls.some((c) => c.path.endsWith("/schedule"))).toBe(false);
  });
});

describe("publish", () => {
  it("publishes, stamps the Run time and sends post_published once", async () => {
    const { post: created } = await draft();
    const res = await postPublish(new Request("http://test"), params(created.id));
    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({ status: "published", error: null, providerPostId: "ss_post_1" });
    expect(getState().runs[0].runTimeSeconds).toBeGreaterThan(0);
    const again = await postPublish(new Request("http://test"), params(created.id));
    expect(again.status).toBe(409);
    const events = (await (await getEvents()).json()).events.map((e: { type: string }) => e.type);
    expect(events.filter((t: string) => t === "post_published")).toHaveLength(1);
  });

  it("shows a refusal with the service's reason text unchanged, on the answer and on the Post", async () => {
    const { post: created } = await draft("instagram");
    fake.answer("POST /posts/:id/publish", fixture("error-platform-constraint"));
    const res = await postPublish(new Request("http://test"), params(created.id));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "platform_constraint", message: "Instagram needs an image or video to publish." });
    const stored = getState().posts[0];
    expect(stored.status).toBe("draft");
    expect(stored.error).toBe("Instagram needs an image or video to publish.");
  });

  it("marks a Post failed when its platform failed, with the platform's reason", async () => {
    const { post: created } = await draft("x");
    fake.answer("POST /posts/:id/publish", partlyFailed);
    const body = await (await postPublish(new Request("http://test"), params(created.id))).json();
    expect(body.post.status).toBe("failed");
    expect(body.post.error).toBe("Failed on X: X rate-limited this post. Retry in a few minutes.");
    expect(getState().runs[0].publishedAt).toBeNull();
  });

  it("passes a rate limit through with Retry-After", async () => {
    const { post: created } = await draft();
    fake.answer("POST /posts/:id/publish", fixture("error-rate-limited"));
    const res = await postPublish(new Request("http://test"), params(created.id));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("answers 502 with the service's message when the key is rejected, and never shows the key", async () => {
    const { post: created } = await draft();
    fake.answer("POST /posts/:id/publish", fixture("error-unauthorized"));
    const res = await postPublish(new Request("http://test"), params(created.id));
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).toContain("Invalid or missing API key");
    expect(text).not.toContain(FAKE_API_KEY);
  });
});

describe("retry and refresh", () => {
  it("retries only the failed platforms and then counts the Post as published", async () => {
    const { post: created } = await draft("x");
    fake.answer("POST /posts/:id/publish", partlyFailed);
    await postPublish(new Request("http://test"), params(created.id));

    const res = await postRetry(new Request("http://test"), params(created.id));
    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({ status: "published", error: null });
    expect(fake.calls.some((c) => c.path === "/posts/ss_post_1/retry-failed-platforms")).toBe(true);
    expect(getState().runs[0].publishedAt).not.toBeNull();
  });

  it("refuses to retry a Post that has not failed", async () => {
    const { post: created } = await draft();
    expect((await postRetry(new Request("http://test"), params(created.id))).status).toBe(409);
  });

  it("marks a Post the service holds for review as failed with the reason", async () => {
    const { post: created } = await draft();
    fake.answer("POST /posts/:id/publish", (call) => {
      const id = call.path.split("/")[2];
      return { status: 200, body: { ...fake.posts.get(id), status: "needs_review" } };
    });
    await postPublish(new Request("http://test"), params(created.id));
    const post = getState().posts[0];
    expect(post.status).toBe("failed");
    expect(post.error).toContain("needs_review");
  });

  it("gives ids a boot prefix so idempotency keys differ across restarts", async () => {
    const { post: created } = await draft();
    expect(created.id).toMatch(/^post_[0-9a-z]{8}_[0-9a-z]{4}$/);
  });

  it("re-reads a Post still on its way out when the list loads", async () => {
    const { post: created } = await draft();
    fake.answer("POST /posts/:id/publish", (call) => {
      const id = call.path.split("/")[2];
      return { status: 200, body: { ...fake.posts.get(id), status: "processing" } };
    });
    await postPublish(new Request("http://test"), params(created.id));
    expect(getState().posts[0].status).toBe("scheduled");

    const done = fake.posts.get("ss_post_1")!;
    fake.posts.set("ss_post_1", { ...done, status: "published", platformStatuses: { linkedin: { status: "published", postUrl: "https://l.example/1" } } });
    const list = await (await getPosts()).json();
    expect(list.posts[0].status).toBe("published");
    expect(getState().runs[0].publishedAt).not.toBeNull();
  });
});
