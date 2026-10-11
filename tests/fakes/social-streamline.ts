// A stand-in for Social Streamline that answers in the shapes recorded from the live API
// (tests/fixtures/social-streamline). Drafts made through it can be scheduled, published and read
// back; `answer` replaces any one call, e.g. with a recorded refusal.

import { readFileSync } from "node:fs";
import { createSocialStreamline } from "@/lib/social/client";

export type Recording = { status: number; headers?: Record<string, string>; body: unknown; source?: string };
export type Call = { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> };
type Answer = Recording | ((call: Call) => Recording);

export function fixture(name: string): Recording {
  return JSON.parse(readFileSync(new URL(`../fixtures/social-streamline/${name}.json`, import.meta.url), "utf8"));
}

type FakePost = Record<string, unknown> & { id: string; platforms: string[] };

export function fakeSocialStreamline() {
  const calls: Call[] = [];
  const posts = new Map<string, FakePost>();
  const answers = new Map<string, Answer>();
  let counter = 0;

  const ok = (body: unknown): Recording => ({ status: 200, body });
  const notFound = (id: string): Recording => ({ status: 404, body: { error: { code: "not_found", message: `No post ${id}.` } } });
  const sent = (post: FakePost) => ({
    ...post,
    status: "published",
    publishedAt: "2026-10-11T21:00:00.000Z",
    platformStatuses: Object.fromEntries(post.platforms.map((p) => [p, { status: "published", postUrl: `https://${p}.example/${post.id}` }])),
  });

  const routes: Record<string, (call: Call, id: string) => Recording> = {
    "POST /content/generate": (call) =>
      ok({
        content: Object.fromEntries(
          (call.body.platforms as string[]).map((p) => [p, { content: { [p === "twitter" ? "tweetText" : "postText"]: `A ${p} caption.` } }]),
        ),
      }),
    "POST /posts": (call) => {
      const created = fixture("posts-create").body as FakePost;
      const post: FakePost = {
        ...created,
        id: `ss_post_${++counter}`,
        content: call.body.content,
        platforms: call.body.platforms as string[],
        mediaUrls: call.body.mediaUrls ?? [],
      };
      posts.set(post.id, post);
      return ok(post);
    },
    "GET /posts/:id": (_call, id) => (posts.has(id) ? ok(posts.get(id)) : notFound(id)),
    "POST /posts/:id/schedule": (call, id) => {
      const post = posts.get(id);
      if (!post) return notFound(id);
      Object.assign(post, { status: "scheduled", scheduledFor: call.body.scheduledFor });
      return ok(post);
    },
    "POST /posts/:id/publish": (_call, id) => {
      const post = posts.get(id);
      if (!post) return notFound(id);
      posts.set(id, sent(post));
      return ok(posts.get(id));
    },
    "POST /posts/:id/retry-failed-platforms": (_call, id) => {
      const post = posts.get(id);
      if (!post) return notFound(id);
      posts.set(id, { ...sent(post), errorMessage: null });
      return ok(posts.get(id));
    },
    "GET /accounts": () => fixture("accounts"),
  };

  async function fakeFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = (init.method ?? "GET").toUpperCase();
    const call: Call = {
      method,
      path,
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : {},
    };
    calls.push(call);

    const id = path.match(/^\/posts\/([^/]+)/)?.[1] ?? "";
    const pattern = `${method} ${id ? path.replace(`/posts/${id}`, "/posts/:id") : path}`;
    const answer = answers.get(pattern);
    const recording = answer
      ? typeof answer === "function"
        ? answer(call)
        : answer
      : routes[pattern]?.(call, decodeURIComponent(id)) ?? { status: 404, body: { error: { code: "not_found", message: `No fake for ${pattern}.` } } };
    return new Response(JSON.stringify(recording.body), {
      status: recording.status,
      headers: { "Content-Type": "application/json", ...recording.headers },
    });
  }

  return {
    client: createSocialStreamline({ apiKey: "ss_test_fake", baseUrl: "https://fake.socialstreamline.test/api/v1", fetch: fakeFetch }),
    calls,
    posts,
    /** Replaces one call, e.g. answer("POST /posts/:id/publish", fixture("error-platform-constraint")). */
    answer(pattern: string, value: Answer) {
      answers.set(pattern, value);
    },
  };
}
