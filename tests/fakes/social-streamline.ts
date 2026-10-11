// A stand-in for Social Streamline that answers in the shapes recorded from the live API
// (tests/fixtures/social-streamline). Drafts made through it can be scheduled, published and read
// back, renders move from queued to succeeded on the second read, and presets, webhooks and
// transcriptions keep what they were given. `answer` replaces any one call, e.g. with a recorded refusal.

import { readFileSync } from "node:fs";
import { createSocialStreamline } from "@/lib/social/client";

export type Recording = { status: number; headers?: Record<string, string>; body: unknown; source?: string };
export type Call = { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> };
type Answer = Recording | ((call: Call) => Recording);

export const FAKE_API_KEY = "fake-test-key";

export function fixture(name: string): Recording {
  return JSON.parse(readFileSync(new URL(`../fixtures/social-streamline/${name}.json`, import.meta.url), "utf8"));
}

type FakePost = Record<string, unknown> & { id: string; platforms: string[] };

export function fakeSocialStreamline() {
  const calls: Call[] = [];
  const posts = new Map<string, FakePost>();
  const answers = new Map<string, Answer>();
  const jobs = new Map<string, Record<string, unknown> & { reads: number }>();
  const presets = new Map<string, Record<string, unknown>>();
  const webhooks = new Map<string, Record<string, unknown>>();
  const state = { credits: 120 };
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_${++counter}`;
  const missing = (id: string): Recording => ({ status: 404, body: { error: { code: "not_found", message: `No ${id}.` } } });
  const page = (items: unknown[]) => ({ data: items, meta: { count: items.length, nextCursor: null } });
  const shown = (job: Record<string, unknown> & { reads: number }) => {
    const copy: Record<string, unknown> = { ...job };
    delete copy.reads;
    return copy;
  };

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

    "GET /posts": () => ok(page([...posts.values()].reverse())),
    "PATCH /posts/:id": (call, id) => {
      const post = posts.get(id);
      if (!post) return notFound(id);
      Object.assign(post, call.body);
      return ok(post);
    },
    "DELETE /posts/:id": (_call, id) => (posts.delete(id) ? ok({ id, deleted: true }) : notFound(id)),

    "GET /me": () => ok({ workspaceId: "ws_fake", email: "founder@example.com", role: "owner", scopes: ["posts:read"] }),
    "GET /credits": () => ok({ creditBalance: state.credits, persistentCredits: 0, pendingCredits: 0, availableCredits: state.credits }),
    "POST /media": (call) => {
      const id = nextId("media");
      return ok({ id, fileName: call.body.file, url: `https://cdn.example/${id}/${call.body.file}`, mimeType: "video/mp4", fileSize: 10 });
    },
    "GET /library": () => fixture("library"),
    "GET /library/counts": () => ok({ counts: [{ kind: "video", source: "uploaded", subtype: null, count: 2 }], total: 2 }),
    "DELETE /library/:id": (_call, id) => ok({ id, deleted: true }),
    "GET /library/:id/posts": () => ok(page([...posts.values()])),

    "POST /videos/short": (call) => queue("short_video", call),
    "POST /videos/long": (call) => queue("long_video", call),
    "GET /jobs": () => ok(page([...jobs.values()].map(shown))),
    "GET /jobs/:id": (_call, id) => {
      const job = jobs.get(id);
      if (!job) return missing(id);
      job.reads += 1;
      if (job.reads >= 2 && job.status === "queued") {
        Object.assign(job, { status: "succeeded", detailStatus: "completed", outputUrls: [`https://cdn.example/${id}.mp4`] });
      }
      return ok(shown(job));
    },
    "POST /jobs/:id/cancel": (_call, id) => (jobs.delete(id) ? ok({ id, cancelled: true }) : missing(id)),
    "POST /transcriptions": (call) => ok({ id: `tr_${call.body.mediaId}`, status: "completed", text: "Today I show how we cut editing time in half." }),

    "GET /presets": () => ok(page([...presets.values()].filter((p) => p.platform))),
    "POST /presets": (call) => keep(presets, "preset", call.body),
    "PATCH /presets/:id": (call, id) => change(presets, id, call.body),
    "DELETE /presets/:id": (_call, id) => (presets.delete(id) ? ok({ id, deleted: true }) : missing(id)),
    "GET /caption-presets": () => ok(page([...presets.values()].filter((p) => !p.platform))),
    "POST /caption-presets": (call) => keep(presets, "caption", call.body),
    "PATCH /caption-presets/:id": (call, id) => change(presets, id, call.body),
    "DELETE /caption-presets/:id": (_call, id) => (presets.delete(id) ? ok({ id, deleted: true }) : missing(id)),
    "GET /posting-defaults": () => ok({ defaults: { short: { captions: { enabled: false } } } }),
    "PUT /posting-defaults/:id": (call) => ok(call.body),

    "GET /webhooks": () => ok(page([...webhooks.values()])),
    "POST /webhooks": (call) => {
      const webhook = { id: nextId("wh"), enabled: true, failureCount: 0, ...call.body };
      webhooks.set(webhook.id, webhook);
      return ok({ ...webhook, secret: "whsec_shown_once" });
    },
    "PATCH /webhooks/:id": (call, id) => change(webhooks, id, call.body),
    "DELETE /webhooks/:id": (_call, id) => (webhooks.delete(id) ? ok({ id, deleted: true }) : missing(id)),
    "POST /webhooks/:id/test": () => ok({ delivered: true }),
    "GET /webhooks/:id/deliveries": () => ok(page([{ id: "del_1", event: "post.published", status: 200 }])),
  };

  function queue(kind: string, call: Call): Recording {
    const job = { id: nextId("job"), kind, status: "queued", detailStatus: "queued", progress: null, outputUrls: [], errorMessage: null, request: call.body, reads: 0 };
    jobs.set(job.id, job);
    return ok(shown(job));
  }

  function keep(map: Map<string, Record<string, unknown>>, prefix: string, body: Record<string, unknown>): Recording {
    const item = { id: nextId(prefix), createdAt: "2026-10-11T00:00:00.000Z", ...body };
    map.set(item.id, item);
    return ok(item);
  }

  function change(map: Map<string, Record<string, unknown>>, id: string, body: Record<string, unknown>): Recording {
    const item = map.get(id);
    if (!item) return missing(id);
    Object.assign(item, body);
    return ok(item);
  }

  async function fakeFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = (init.method ?? "GET").toUpperCase();
    const call: Call = {
      method,
      path,
      headers: { ...(init.headers as Record<string, string>) },
      body:
        typeof init.body === "string"
          ? JSON.parse(init.body)
          : init.body instanceof FormData
            ? { file: (init.body.get("file") as File | null)?.name }
            : {},
    };
    calls.push(call);

    // The segment after a collection name is an id, except for fixed names such as /library/counts.
    const match = path.match(/^\/(posts|jobs|library|presets|caption-presets|webhooks|posting-defaults)\/([^/]+)/);
    const id = match && match[2] !== "counts" ? match[2] : "";
    const pattern = `${method} ${match && id ? path.replace(`/${match[1]}/${id}`, `/${match[1]}/:id`) : path}`;
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
    client: createSocialStreamline({ apiKey: FAKE_API_KEY, baseUrl: "https://fake.socialstreamline.test/api/v1", fetch: fakeFetch }),
    calls,
    posts,
    jobs,
    state,
    /** Replaces one call, e.g. answer("POST /posts/:id/publish", fixture("error-platform-constraint")). */
    answer(pattern: string, value: Answer) {
      answers.set(pattern, value);
    },
  };
}
