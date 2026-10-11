import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/company/route";
import { PUT as putBrief } from "@/app/api/brief/route";
import { GET as listBlogs, POST as writeBlog } from "@/app/api/blogs/route";
import { DELETE as deleteBlog, GET as getBlog, PATCH as patchBlog } from "@/app/api/blogs/[id]/route";
import { POST as postCaptions } from "@/app/api/posts/captions/route";
import { parseBlog, toSlug } from "@/lib/content/blog-ai";
import { bannedWordsIn } from "@/lib/content/blogs";
import { installFakeContent, resetContent, type FakeBlogAI } from "@/lib/content/testing";
import { resetSocialStreamline, setSocialStreamline } from "@/lib/social";
import { resetStore } from "@/lib/store";
import { fakeSocialStreamline } from "./fakes/social-streamline";

function send(method: string, path: string, body?: unknown): Request {
  return new Request(`http://test${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let blogAI: FakeBlogAI;
let fake: ReturnType<typeof fakeSocialStreamline>;

async function approvedBrief(documents: { filename: string; text: string }[] = []) {
  await postCompany(send("POST", "/api/company", { url: "https://acme.example", documents }));
  await putBrief(send("PUT", "/api/brief", { approved: true }));
}

beforeEach(() => {
  resetStore();
  ({ blogAI } = installFakeContent());
  fake = fakeSocialStreamline();
  setSocialStreamline(fake.client);
});

afterEach(() => {
  resetContent();
  resetSocialStreamline();
});

describe("writing a blog post", () => {
  it("writes from the Brief, Voice and Documents, then saves it", async () => {
    await approvedBrief([{ filename: "deck.txt", text: "Robots for small warehouses." }]);
    const res = await writeBlog(send("POST", "/api/blogs", { topic: "picking speed", keyword: "warehouse robots", length: "long" }));
    expect(res.status).toBe(201);
    const { post } = await res.json();
    expect(post).toMatchObject({ title: "How acme handles picking speed", slug: "how-acme-handles-picking-speed", length: "long", keyword: "warehouse robots", warnings: [] });

    const request = blogAI.calls[0];
    expect(request.brief).toContain("helps founders");
    expect(request.voice?.bannedWords).toContain("revolutionary");
    expect(request.documents[0].text).toBe("Robots for small warehouses.");
    expect(request.length).toBe("long");

    const list = await (await listBlogs()).json();
    expect(list.posts.map((p: { id: string }) => p.id)).toEqual([post.id]);
    expect(list.storage).toBe("memory");
  });

  it("tells the writer which titles exist, so a new post takes another angle", async () => {
    await approvedBrief();
    await writeBlog(send("POST", "/api/blogs", { topic: "onboarding" }));
    await writeBlog(send("POST", "/api/blogs", {}));
    expect(blogAI.calls[1].avoidTitles).toEqual(["How acme handles onboarding"]);
    expect(blogAI.calls[1].topic).toBe("");
  });

  it("rewrites once when a banned word slips in, and flags any that remain", async () => {
    await approvedBrief();
    const draft = { slug: "x", metaDescription: "m", tags: [], markdown: "A revolutionary way to pick." };
    blogAI.scripted = [
      { ...draft, title: "First" },
      { ...draft, title: "Second", markdown: "Still a game-changing way to pick." },
    ];
    const { post } = await (await writeBlog(send("POST", "/api/blogs", {}))).json();
    expect(blogAI.calls).toHaveLength(2);
    expect(blogAI.calls[1].feedback).toBe("It used banned words: revolutionary.");
    expect(post.title).toBe("Second");
    expect(post.warnings).toEqual(["game-changing"]);
  });

  it("refuses before generating when the Brief is not approved or the length is unknown", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    expect((await writeBlog(send("POST", "/api/blogs", {}))).status).toBe(409);
    await putBrief(send("PUT", "/api/brief", { approved: true }));
    expect((await writeBlog(send("POST", "/api/blogs", { length: "novel" }))).status).toBe(422);
    expect(blogAI.calls).toHaveLength(0);
  });

  it("passes OpenAI's failure through and saves nothing", async () => {
    await approvedBrief();
    blogAI.error = "OpenAI refused the request (429): Rate limit reached.";
    const res = await writeBlog(send("POST", "/api/blogs", {}));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toBe("OpenAI refused the request (429): Rate limit reached.");
    expect((await (await listBlogs()).json()).posts).toEqual([]);
  });
});

describe("editing and deleting", () => {
  it("edits the fields, cleans the slug and checks banned words again", async () => {
    await approvedBrief();
    const { post } = await (await writeBlog(send("POST", "/api/blogs", {}))).json();
    const res = await patchBlog(
      send("PATCH", "/x", { title: "New title", slug: "  New Title, Again! ", tags: [" a ", "", "b"], markdown: "Now seamless." }),
      params(post.id),
    );
    const edited = (await res.json()).post;
    expect(edited).toMatchObject({ title: "New title", slug: "new-title-again", tags: ["a", "b"], markdown: "Now seamless.", warnings: ["seamless"] });
    expect((await (await getBlog(send("GET", "/x"), params(post.id))).json()).post.title).toBe("New title");
    expect((await patchBlog(send("PATCH", "/x", { markdown: "  " }), params(post.id))).status).toBe(422);
  });

  it("deletes a post", async () => {
    await approvedBrief();
    const { post } = await (await writeBlog(send("POST", "/api/blogs", {}))).json();
    expect((await deleteBlog(send("DELETE", "/x"), params(post.id))).status).toBe(200);
    expect((await getBlog(send("GET", "/x"), params(post.id))).status).toBe(404);
    expect((await deleteBlog(send("DELETE", "/x"), params(post.id))).status).toBe(404);
  });
});

describe("promoting a post", () => {
  it("writes captions about the post that end with its link", async () => {
    await approvedBrief();
    const { post } = await (await writeBlog(send("POST", "/api/blogs", { topic: "picking speed" }))).json();
    const res = await postCaptions(send("POST", "/x", { platforms: ["linkedin", "x"], blogId: post.id, link: "https://acme.example/blog/picking" }));
    expect(res.status).toBe(201);
    const transcript = fake.calls.find((c) => c.path === "/content/generate")!.body.transcript as string;
    expect(transcript).toContain("Blog post: How acme handles picking speed");
    expect(transcript).toContain("End every post with this link: https://acme.example/blog/picking");
    expect(transcript).toContain("## Why it matters");
  });

  it("refuses an unknown post and a link that is not https", async () => {
    await approvedBrief();
    expect((await postCaptions(send("POST", "/x", { platforms: ["x"], blogId: "blog_none" }))).status).toBe(404);
    const { post } = await (await writeBlog(send("POST", "/api/blogs", {}))).json();
    expect((await postCaptions(send("POST", "/x", { platforms: ["x"], blogId: post.id, link: "javascript:alert(1)" }))).status).toBe(422);
  });
});

describe("helpers", () => {
  it("makes slugs and finds banned words as whole words only", () => {
    expect(toSlug("  Why Founders Write Less -- & Ship More!  ")).toBe("why-founders-write-less-ship-more");
    const voice = { id: "v", companyId: "c", tone: "t", rules: [], bannedWords: ["best", "game-changing"] };
    expect(bannedWordsIn("The bestseller is a Game-Changing tool.", voice)).toEqual(["game-changing"]);
  });

  it("rejects an OpenAI answer in the wrong shape", () => {
    const answer = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
    expect(() => parseBlog(answer({ title: "T" }))).toThrow("unexpected shape");
    expect(parseBlog(answer({ title: " T ", slug: "", metaDescription: "m", tags: ["a", 3], markdown: " body " }))).toEqual({
      title: "T",
      slug: "t",
      metaDescription: "m",
      tags: ["a"],
      markdown: "body",
    });
  });
});

describe("markdown preview", () => {
  it("renders the structure and never injects HTML or script links", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MarkdownPreview } = await import("@/app/(panel)/blog/markdown");
    const html = renderToStaticMarkup(
      createElement(MarkdownPreview, {
        markdown: "## Why\n\nPick **faster** with *less* effort. <img src=x onerror=alert(1)>\n\n- one\n- two\n\n[safe](https://acme.example) and [bad](javascript:alert(1))",
      }),
    );
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>faster</strong>");
    expect(html).toContain("<em>less</em>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('href="https://acme.example"');
    expect(html).not.toContain("javascript:");
  });
});
