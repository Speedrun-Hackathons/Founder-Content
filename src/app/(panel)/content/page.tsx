"use client";

import { api } from "@/lib/client";
import { PLATFORMS, type Account, type Platform, type Post, type PostStatus } from "@/lib/model";
import { useEffect, useState } from "react";

const LABEL: Record<Platform, string> = {
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  threads: "Threads",
};

const STATUS_STYLE: Record<PostStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  scheduled: "bg-sky-50 text-sky-700",
  published: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const TABS = ["all", "draft", "scheduled", "published", "failed"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { all: "All", draft: "Drafts", scheduled: "Scheduled", published: "Published", failed: "Failed" };

type CaptionResult = { platform: Platform; ok: true; post: Post } | { platform: Platform; ok: false; error: string };

function tomorrow(): string {
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
}

export default function ContentPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [connected, setConnected] = useState<Platform[] | null>(null);
  const [chosen, setChosen] = useState<Platform[]>(["linkedin", "x"]);
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [error, setError] = useState("");
  const [when, setWhen] = useState("");

  function load() {
    api<{ posts: Post[] }>("/api/posts")
      .then((r) => setPosts(r.posts))
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    load();
    api<{ accounts: Account[] }>("/api/accounts")
      .then((r) => setConnected([...new Set(r.accounts.filter((a) => a.connected).map((a) => a.platform))]))
      .catch(() => setConnected(null));
  }, []);

  function toggle(platform: Platform) {
    setChosen((current) => (current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform]));
  }

  async function writeCaptions() {
    setError("");
    setResults([]);
    setWriting(true);
    try {
      const r = await api<{ results: CaptionResult[] }>("/api/posts/captions", {
        method: "POST",
        body: JSON.stringify({ platforms: chosen }),
      });
      setResults(r.results);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  async function act(post: Post, action: "schedule" | "publish" | "retry") {
    if (action === "publish" && !window.confirm(`Publish to ${LABEL[post.platform]} now? This reaches a real audience and cannot be unsent.`)) {
      return;
    }
    setError("");
    setBusy(post.id);
    try {
      const body = action === "schedule" ? JSON.stringify({ scheduledFor: when ? new Date(when).toISOString() : tomorrow() }) : undefined;
      await api(`/api/posts/${post.id}/${action}`, { method: "POST", body });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  }

  const ordered = [...PLATFORMS].sort((a, b) => Number(connected?.includes(b) ?? 0) - Number(connected?.includes(a) ?? 0));
  const shown = tab === "all" ? posts : posts.filter((p) => p.status === tab);
  const failedCount = posts.filter((p) => p.status === "failed").length;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Content</h1>
      <p className="mt-1 text-sm text-zinc-600">Write a post per Platform from the approved Brief, then schedule it or publish it now.</p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Write captions</h2>
        <p className="mt-1 text-sm text-zinc-600">
          One caption per Platform in your Voice. Each one is saved as a draft first; nothing is sent until you schedule or publish it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ordered.map((platform) => {
            const isConnected = connected === null || connected.includes(platform);
            const on = chosen.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => toggle(platform)}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700"}`}
                title={isConnected ? undefined : "Not connected in Social Streamline: drafts work, publishing will be refused."}
              >
                {LABEL[platform]}
                {!isConnected && <span className={`ml-1 text-xs ${on ? "text-zinc-300" : "text-zinc-400"}`}>- not connected</span>}
              </button>
            );
          })}
        </div>
        <button
          onClick={writeCaptions}
          disabled={writing || chosen.length === 0}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {writing ? "Writing..." : `Write ${chosen.length} caption${chosen.length === 1 ? "" : "s"}`}
        </button>

        {results.length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {results.map((r) => (
              <div key={r.platform} className={`rounded-md border p-3 text-sm ${r.ok ? "border-zinc-200" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{LABEL[r.platform]}</span>
                  <span className={`text-xs ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.ok ? "Draft saved" : "Failed"}</span>
                </div>
                <p className={`mt-2 whitespace-pre-line ${r.ok ? "text-zinc-700" : "text-red-700"}`}>{r.ok ? r.post.text : r.error}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1 ${tab === t ? "bg-white font-medium shadow-sm" : "text-zinc-600"}`}
              >
                {TAB_LABEL[t]}
                {t === "failed" && failedCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{failedCount}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="send-time" className="text-zinc-600">
              Send time
            </label>
            <input
              id="send-time"
              type="datetime-local"
              className="rounded-md border border-zinc-300 px-2 py-1"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <span className="text-zinc-500">empty means 24 hours from now</span>
            <button onClick={load} className="rounded-md border border-zinc-300 px-3 py-1">
              Refresh
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600">
            {posts.length === 0 ? "No drafts yet. Write captions above, or make a draft from a Variant on the Ads page." : "Nothing here."}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {shown.map((post) => (
              <li key={post.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-zinc-900">{post.text || <span className="text-zinc-400">(no text)</span>}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {LABEL[post.platform]}
                      {post.variantId ? " - from an Ad Variant" : " - caption"}
                      {post.scheduledFor && ` - ${post.status === "scheduled" ? "sends" : "sent"} ${new Date(post.scheduledFor).toLocaleString()}`}
                    </p>
                    {post.error && <p className="mt-2 text-sm text-amber-700">{post.error}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[post.status]}`}>{post.status}</span>
                  <div className="flex shrink-0 gap-2">
                    {post.status === "failed" ? (
                      <button
                        onClick={() => act(post, "retry")}
                        disabled={busy === post.id}
                        className="rounded-md border border-amber-300 px-3 py-1 text-xs text-amber-800 disabled:opacity-50"
                      >
                        Retry failed
                      </button>
                    ) : post.status !== "published" ? (
                      <>
                        <button
                          onClick={() => act(post, "schedule")}
                          disabled={busy === post.id}
                          className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50"
                        >
                          Schedule
                        </button>
                        <button
                          onClick={() => act(post, "publish")}
                          disabled={busy === post.id}
                          className="rounded-md bg-zinc-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Publish now
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
