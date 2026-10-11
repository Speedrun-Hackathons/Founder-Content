import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/company/route";
import { PUT as putBrief } from "@/app/api/brief/route";
import { POST as postCaptions } from "@/app/api/posts/captions/route";
import { GET as getPosts } from "@/app/api/posts/route";
import { resetSocialStreamline, setSocialStreamline } from "@/lib/social";
import { installFakeContent, resetContent } from "@/lib/content/testing";
import { getState, resetStore } from "@/lib/store";
import { fakeSocialStreamline, fixture } from "./fakes/social-streamline";

function post(path: string, body: unknown): Request {
  return new Request(`http://test${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function approvedBrief(text = "Founder Content turns a company URL into posts that are tested and scheduled for a founder who has no time to write.") {
  await postCompany(post("/api/company", { url: "https://example.com" }));
  await putBrief(new Request("http://test/api/brief", { method: "PUT", body: JSON.stringify({ text, approved: true }) }));
}

let fake: ReturnType<typeof fakeSocialStreamline>;

beforeEach(() => {
  resetStore();
  installFakeContent();
  fake = fakeSocialStreamline();
  setSocialStreamline(fake.client);
});

afterEach(() => {
  resetSocialStreamline();
  resetContent();
});

describe("captions and drafts per Platform", () => {
  it("writes one caption per Platform and makes a draft for each", async () => {
    await approvedBrief();
    const res = await postCaptions(post("/api/posts/captions", { platforms: ["linkedin", "x"] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results.map((r: { platform: string; ok: boolean }) => [r.platform, r.ok])).toEqual([
      ["linkedin", true],
      ["x", true],
    ]);
    expect(body.results[1].post).toMatchObject({ platform: "x", status: "draft", text: "A twitter caption.", origin: "caption", variantId: "" });
    expect(body.results[1].post.providerPostId).toMatch(/^ss_post_/);

    const list = await (await getPosts()).json();
    expect(list.posts).toHaveLength(2);
    expect(getState().runs[0].platforms).toEqual(["linkedin", "x"]);
  });

  it("sends the Brief and the Voice to the caption tool", async () => {
    await approvedBrief();
    await postCaptions(post("/api/posts/captions", { platforms: ["linkedin"] }));
    const sent = fake.calls.find((c) => c.path === "/content/generate")!;
    const transcript = sent.body.transcript as string;
    expect(sent.body.platforms).toEqual(["linkedin"]);
    expect(transcript).toContain("Founder Content turns a company URL");
    expect(transcript).toContain("Tone: plain, direct, confident.");
    expect(transcript).toContain("Never use these words: revolutionary, seamless, game-changing.");
  });

  it("shows a failed Platform's error next to the one that worked", async () => {
    await approvedBrief();
    fake.answer("POST /content/generate", fixture("content-generate.partial"));
    const body = await (await postCaptions(post("/api/posts/captions", { platforms: ["linkedin", "x"] }))).json();
    expect(body.results[0]).toMatchObject({ platform: "linkedin", ok: true });
    expect(body.results[1]).toEqual({ platform: "x", ok: false, error: "Caption generation failed for twitter. Try again." });
    expect(fake.calls.filter((c) => c.method === "POST" && c.path === "/posts")).toHaveLength(1);
    expect(getState().posts).toHaveLength(1);
  });

  it("keeps the other drafts when one draft is refused", async () => {
    await approvedBrief();
    fake.answer("POST /posts", (call) =>
      (call.body.platforms as string[])[0] === "instagram"
        ? fixture("error-platform-constraint")
        : { status: 200, body: { ...(fixture("posts-create").body as object), id: "ss_linkedin", platforms: ["linkedin"] } },
    );
    const body = await (await postCaptions(post("/api/posts/captions", { platforms: ["linkedin", "instagram"] }))).json();
    expect(body.results[0]).toMatchObject({ platform: "linkedin", ok: true });
    expect(body.results[1]).toEqual({ platform: "instagram", ok: false, error: "Instagram needs an image or video to publish." });
  });

  it("passes the service's refusal of the whole request through unchanged", async () => {
    await approvedBrief();
    fake.answer("POST /content/generate", fixture("error-transcript-too-short"));
    const res = await postCaptions(post("/api/posts/captions", { platforms: ["linkedin"] }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe(
      "The transcript is only 105 characters (minimum 120). There is not enough spoken content to write from.",
    );
  });

  it("refuses an unapproved Brief and an unknown platform before calling the service", async () => {
    await postCompany(post("/api/company", { url: "https://example.com" }));
    const unapproved = await postCaptions(post("/api/posts/captions", { platforms: ["linkedin"] }));
    expect(unapproved.status).toBe(409);
    await putBrief(new Request("http://test/api/brief", { method: "PUT", body: JSON.stringify({ approved: true }) }));
    const unknown = await postCaptions(post("/api/posts/captions", { platforms: ["myspace"] }));
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).message).toContain("myspace");
    expect(fake.calls).toHaveLength(0);
  });

  it("answers 503 when the server has no posting-service key", async () => {
    resetSocialStreamline();
    const saved = process.env.SOCIAL_STREAMLINE_API_KEY;
    delete process.env.SOCIAL_STREAMLINE_API_KEY;
    try {
      await approvedBrief();
      const res = await postCaptions(post("/api/posts/captions", { platforms: ["linkedin"] }));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("posting_service_not_configured");
    } finally {
      if (saved !== undefined) process.env.SOCIAL_STREAMLINE_API_KEY = saved;
    }
  });
});
