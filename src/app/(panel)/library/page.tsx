"use client";

import { Banner, Card, PageHeader, Spinner } from "@/app/(panel)/ads/_components/ui";
import { api } from "@/lib/client";
import type { LibraryItem, ProviderPost } from "@/lib/social/client";
import { useEffect, useState } from "react";

type Counts = { counts: { kind: string; source: string; subtype: string | null; count: number }[]; total: number };
type Page = { items: LibraryItem[]; nextCursor: string | null; counts: Counts | null };

const FILTERS: { label: string; query: string }[] = [
  { label: "All", query: "" },
  { label: "Videos", query: "kind=video" },
  { label: "Shorts", query: "kind=video&subtype=short" },
  { label: "Wide", query: "kind=video&subtype=wide" },
  { label: "Images", query: "kind=image" },
  { label: "Uploaded", query: "source=uploaded" },
  { label: "Rendered", query: "source=created" },
  { label: "AI generated", query: "source=generated" },
];

export default function LibraryPage() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [usedIn, setUsedIn] = useState<ProviderPost[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    const query = [filter.query, search.trim() ? `q=${encodeURIComponent(search.trim())}` : ""].filter(Boolean).join("&");
    api<Page>(`/api/social/library${query ? `?${query}` : ""}`)
      .then((r) => {
        if (!current) return;
        setPage(r);
        if (r.counts) setCounts(r.counts);
      })
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [filter, search, version]);

  async function more() {
    if (!page?.nextCursor) return;
    const query = [filter.query, `cursor=${encodeURIComponent(page.nextCursor)}`].filter(Boolean).join("&");
    try {
      const next = await api<Page>(`/api/social/library?${query}`);
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/social/media", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${body.message ?? response.status}`);
      }
      setNotice(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function open(item: LibraryItem) {
    setSelected(item);
    setUsedIn(null);
    try {
      setUsedIn((await api<{ posts: ProviderPost[] }>(`/api/social/library/${item.id}`)).posts);
    } catch {
      setUsedIn([]);
    }
  }

  async function remove(item: LibraryItem) {
    if (!window.confirm(`Remove "${item.title}" from the library? Posts already published with it are not affected.`)) return;
    try {
      await api(`/api/social/library/${item.id}`, { method: "DELETE" });
      setSelected(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const total = (kind: string) => counts?.counts.filter((c) => c.kind === kind).reduce((sum, c) => sum + c.count, 0) ?? 0;

  return (
    <div className="max-w-6xl">
      <PageHeader title="Library" subtitle="Everything uploaded, rendered or generated in Social Streamline.">
        <label className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
          {busy ? "Uploading..." : "Upload files"}
          <input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
        </label>
      </PageHeader>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="notice">{notice}</Banner>}

      {counts && (
        <p className="mt-4 text-sm text-zinc-600">
          {counts.total.toLocaleString("en-US")} items: {total("video").toLocaleString("en-US")} videos, {total("image").toLocaleString("en-US")} images
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700"}`}
          >
            {f.label}
          </button>
        ))}
        <input
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 flex gap-4">
        <div className="min-w-0 flex-1">
          {!page ? (
            <Spinner />
          ) : page.items.length === 0 ? (
            <p className="text-sm text-zinc-600">Nothing here.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {page.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => open(item)}
                  className={`overflow-hidden rounded-xl border bg-white text-left shadow-sm ${selected?.id === item.id ? "border-zinc-900 ring-2 ring-zinc-900" : "border-zinc-200"}`}
                >
                  <div className="flex aspect-video items-center justify-center bg-zinc-100">
                    {item.kind === "image" || item.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.posterUrl ?? item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-zinc-500">Video</span>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-xs font-medium" title={item.title}>
                      {item.title || item.id}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {[item.subtype ?? item.kind, item.source, item.durationSec ? `${Math.round(item.durationSec)} s` : ""].filter(Boolean).join(" - ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {page?.nextCursor && (
            <button onClick={more} className="mt-4 rounded-md border border-zinc-300 px-4 py-1.5 text-sm">
              Load more
            </button>
          )}
        </div>

        {selected && (
          <Card className="w-80 shrink-0 self-start p-4">
            <div className="flex justify-between">
              <h2 className="truncate text-sm font-semibold" title={selected.title}>
                {selected.title}
              </h2>
              <button onClick={() => setSelected(null)} className="text-xs text-zinc-500 underline">
                Close
              </button>
            </div>
            {selected.kind === "video" ? (
              <video src={selected.url} poster={selected.posterUrl ?? undefined} controls className="mt-3 w-full rounded-lg bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.url} alt="" className="mt-3 w-full rounded-lg border border-zinc-200" />
            )}
            <p className="mt-2 text-xs text-zinc-500">
              {[selected.kind, selected.subtype, selected.source, selected.createdAt && new Date(selected.createdAt).toLocaleDateString("en-US")].filter(Boolean).join(" - ")}
            </p>
            <button onClick={() => navigator.clipboard?.writeText(selected.url)} className="mt-3 rounded-md border border-zinc-300 px-3 py-1 text-xs">
              Copy public URL
            </button>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Used in</h3>
            {usedIn === null ? (
              <Spinner />
            ) : usedIn.length === 0 ? (
              <p className="text-xs text-zinc-500">No posts yet.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-xs">
                {usedIn.slice(0, 8).map((p) => (
                  <li key={p.id} className="truncate" title={p.content}>
                    {p.status}: {p.content || "(no text)"}
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => remove(selected)} className="mt-2 rounded-md border border-red-200 px-3 py-1 text-xs text-red-700">
              Remove from library
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
