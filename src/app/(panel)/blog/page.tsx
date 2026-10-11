"use client";

import { Banner, Card, PageHeader, Spinner, platformName } from "@/app/(panel)/ads/_components/ui";
import { api } from "@/lib/client";
import type { BlogLength } from "@/lib/content/blog-ai";
import type { BlogPost } from "@/lib/content/blogs";
import { PLATFORMS, type Platform } from "@/lib/model";
import { useEffect, useState } from "react";
import { MarkdownPreview } from "./markdown";

const LENGTHS: { value: BlogLength; label: string }[] = [
  { value: "short", label: "Short, about 700 words" },
  { value: "standard", label: "Standard, about 1,200 words" },
  { value: "long", label: "Long, about 2,000 words" },
];

type Draft = Pick<BlogPost, "title" | "slug" | "metaDescription" | "markdown"> & { tags: string };

function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function download(post: BlogPost, draft: Draft) {
  const front = [
    "---",
    `title: ${JSON.stringify(draft.title)}`,
    `slug: ${draft.slug}`,
    `description: ${JSON.stringify(draft.metaDescription)}`,
    `tags: [${draft.tags.split(",").map((t) => JSON.stringify(t.trim())).filter((t) => t !== '""').join(", ")}]`,
    `date: ${post.createdAt.slice(0, 10)}`,
    "---",
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([`${front}# ${draft.title}\n\n${draft.markdown}\n`], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${draft.slug || "post"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [storage, setStorage] = useState<"postgres" | "memory" | null>(null);
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [length, setLength] = useState<BlogLength>("standard");
  const [writing, setWriting] = useState(false);
  const [selected, setSelected] = useState<BlogPost | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<{ posts: BlogPost[]; storage: "postgres" | "memory" }>("/api/blogs")
      .then((r) => {
        setPosts(r.posts);
        setStorage(r.storage);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function open(post: BlogPost) {
    setSelected(post);
    setDraft({ title: post.title, slug: post.slug, metaDescription: post.metaDescription, markdown: post.markdown, tags: post.tags.join(", ") });
    setPreview(true);
    setNotice("");
  }

  async function write() {
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const { post } = await api<{ post: BlogPost }>("/api/blogs", { method: "POST", body: JSON.stringify({ topic, keyword, length }) });
      setPosts((current) => [post, ...(current ?? [])]);
      setTopic("");
      open(post);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    setError("");
    try {
      const { post } = await api<{ post: BlogPost }>(`/api/blogs/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...draft, tags: draft.tags.split(",") }),
      });
      setPosts((current) => (current ?? []).map((p) => (p.id === post.id ? post : p)));
      open(post);
      setNotice("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected || !window.confirm(`Delete "${selected.title}"?`)) return;
    try {
      await api(`/api/blogs/${selected.id}`, { method: "DELETE" });
      setPosts((current) => (current ?? []).filter((p) => p.id !== selected.id));
      setSelected(null);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const dirty =
    !!selected &&
    !!draft &&
    (draft.title !== selected.title ||
      draft.slug !== selected.slug ||
      draft.metaDescription !== selected.metaDescription ||
      draft.markdown !== selected.markdown ||
      draft.tags !== selected.tags.join(", "));
  const input = "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-6xl">
      <PageHeader title="Blog" subtitle="Long-form posts written from your approved Brief, Voice and Documents, then promoted on social." />
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="notice">{notice}</Banner>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Write a post</h2>
            <label htmlFor="blog-topic" className="mt-3 block text-sm font-medium">
              Topic
            </label>
            <textarea
              id="blog-topic"
              className={`${input} h-20`}
              placeholder="Leave empty and the writer picks the most useful topic from your Brief"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <label htmlFor="blog-keyword" className="mt-3 block text-sm font-medium">
              Search keyword (optional)
            </label>
            <input id="blog-keyword" className={input} placeholder="e.g. warehouse robots" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <label htmlFor="blog-length" className="mt-3 block text-sm font-medium">
              Length
            </label>
            <select id="blog-length" className={input} value={length} onChange={(e) => setLength(e.target.value as BlogLength)}>
              {LENGTHS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <button onClick={write} disabled={writing} className="mt-4 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {writing ? "Writing, this takes up to a minute..." : "Write the post"}
            </button>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Posts</h2>
            {storage === "memory" && <p className="mt-1 text-xs text-amber-700">Kept in memory only: set DATABASE_URL to keep posts across restarts.</p>}
            {posts === null ? (
              <Spinner />
            ) : posts.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No posts yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {posts.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => open(p)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selected?.id === p.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
                    >
                      <div className="line-clamp-2 font-medium">{p.title}</div>
                      <div className={`text-xs ${selected?.id === p.id ? "text-zinc-300" : "text-zinc-500"}`}>
                        {words(p.markdown).toLocaleString("en-US")} words - {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {p.warnings.length > 0 && " - check wording"}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {selected && draft ? (
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="p-5">
              {selected.warnings.length > 0 && (
                <Banner tone="warning">This post uses words your Voice bans: {selected.warnings.join(", ")}. Edit them out before publishing.</Banner>
              )}
              <label htmlFor="blog-title" className="mt-2 block text-sm font-medium">
                Title <span className={`text-xs ${draft.title.length > 70 ? "text-amber-700" : "text-zinc-400"}`}>{draft.title.length}/70</span>
              </label>
              <input id="blog-title" className={`${input} text-base font-semibold`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="blog-slug" className="block text-sm font-medium">
                    Slug
                  </label>
                  <input id="blog-slug" className={`${input} font-mono text-xs`} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="blog-tags" className="block text-sm font-medium">
                    Tags, comma separated
                  </label>
                  <input id="blog-tags" className={input} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                </div>
              </div>
              <label htmlFor="blog-meta" className="mt-3 block text-sm font-medium">
                Meta description{" "}
                <span className={`text-xs ${draft.metaDescription.length > 155 ? "text-amber-700" : "text-zinc-400"}`}>{draft.metaDescription.length}/155</span>
              </label>
              <input id="blog-meta" className={input} value={draft.metaDescription} onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })} />

              <div className="mt-5 flex items-center justify-between">
                <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm">
                  {[
                    [true, "Preview"],
                    [false, "Edit Markdown"],
                  ].map(([value, label]) => (
                    <button
                      key={String(label)}
                      onClick={() => setPreview(value as boolean)}
                      className={`rounded px-3 py-1 ${preview === value ? "bg-white font-medium shadow-sm" : "text-zinc-600"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-zinc-500">{words(draft.markdown).toLocaleString("en-US")} words</span>
              </div>
              {preview ? (
                <article className="mt-3 rounded-lg border border-zinc-200 p-5">
                  <h1 className="text-2xl font-semibold tracking-tight">{draft.title}</h1>
                  <MarkdownPreview markdown={draft.markdown} />
                </article>
              ) : (
                <textarea
                  value={draft.markdown}
                  onChange={(e) => setDraft({ ...draft, markdown: e.target.value })}
                  spellCheck
                  className="mt-3 h-[32rem] w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm leading-relaxed"
                />
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={save} disabled={!dirty || saving} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
                  {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(`# ${draft.title}\n\n${draft.markdown}`).then(() => setNotice("Markdown copied."))}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
                >
                  Copy Markdown
                </button>
                <button onClick={() => download(selected, draft)} className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
                  Download .md
                </button>
                <button onClick={remove} className="ml-auto rounded-md border border-red-200 px-4 py-2 text-sm text-red-700">
                  Delete
                </button>
              </div>
            </Card>
            <Promote post={selected} dirty={dirty} />
          </div>
        ) : (
          <Card className="flex items-center justify-center p-10 text-sm text-zinc-500">Write a post, or pick one from the list.</Card>
        )}
      </div>
    </div>
  );
}

type CaptionResult = { platform: Platform; ok: boolean; error?: string };

/** Writes a social draft per Platform that points readers to the post. */
function Promote({ post, dirty }: { post: BlogPost; dirty: boolean }) {
  const [chosen, setChosen] = useState<Platform[]>(["linkedin", "x", "threads"]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [error, setError] = useState("");

  async function promote() {
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const r = await api<{ results: CaptionResult[] }>("/api/posts/captions", {
        method: "POST",
        body: JSON.stringify({ platforms: chosen, blogId: post.id, link: link.trim() || undefined }),
      });
      setResults(r.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Promote on social</h2>
      <p className="text-sm text-zinc-500">Writes a draft per Platform about this post. Nothing is sent until you schedule or publish it on Content.</p>
      <label htmlFor="blog-link" className="mt-3 block text-sm font-medium">
        Link to the published post (optional)
      </label>
      <input
        id="blog-link"
        placeholder="https://yourcompany.com/blog/..."
        value={link}
        onChange={(e) => setLink(e.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => {
          const on = chosen.includes(p);
          return (
            <button
              key={p}
              onClick={() => setChosen((c) => (on ? c.filter((x) => x !== p) : [...c, p]))}
              className={`rounded-full border px-3 py-1 text-sm ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700"}`}
            >
              {platformName(p)}
            </button>
          );
        })}
      </div>
      {dirty && <p className="mt-2 text-xs text-amber-700">Save your changes first; the drafts are written from the saved post.</p>}
      <button
        onClick={promote}
        disabled={busy || chosen.length === 0 || dirty || (link !== "" && !link.startsWith("https://"))}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Writing drafts..." : `Write ${chosen.length} social draft${chosen.length === 1 ? "" : "s"}`}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {results.map((r) => (
            <li key={r.platform} className={r.ok ? "text-emerald-700" : "text-red-700"}>
              {platformName(r.platform)}: {r.ok ? "draft saved" : r.error}
            </li>
          ))}
          <li>
            <a href="/content" className="text-brand-700 underline">
              Review them on Content
            </a>
          </li>
        </ul>
      )}
    </Card>
  );
}
