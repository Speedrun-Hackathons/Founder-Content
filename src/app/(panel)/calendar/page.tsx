"use client";

import { Banner, Card, PageHeader, Spinner, platformName } from "@/app/(panel)/ads/_components/ui";
import { api } from "@/lib/client";
import type { CalendarEntry } from "@/lib/social/calendar";
import { useEffect, useMemo, useState } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS: Record<string, { label: string; dot: string; chip: string }> = {
  scheduled: { label: "Scheduled", dot: "bg-sky-500", chip: "border-sky-200 bg-sky-50 text-sky-900" },
  published: { label: "Published", dot: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  failed: { label: "Failed", dot: "bg-red-500", chip: "border-red-200 bg-red-50 text-red-900" },
};

function statusOf(entry: CalendarEntry) {
  if (entry.failed.length > 0 && entry.status !== "scheduled") return STATUS.failed;
  return STATUS[entry.status] ?? STATUS.scheduled;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** The six weeks shown for a month, starting on the Monday on or before the 1st. */
function gridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [result, setResult] = useState<{ key: string; entries: CalendarEntry[]; error: string; reachesBackTo: string | null }>({
    key: "",
    entries: [],
    error: "",
    reachesBackTo: null,
  });
  const [selected, setSelected] = useState<CalendarEntry | null>(null);

  const days = useMemo(() => gridDays(month), [month]);
  const rangeKey = days[0].toISOString();

  useEffect(() => {
    let current = true;
    const to = new Date(days[41].getFullYear(), days[41].getMonth(), days[41].getDate() + 1).toISOString();
    api<{ entries: CalendarEntry[]; reachesBackTo: string | null }>(`/api/social/calendar?from=${encodeURIComponent(rangeKey)}&to=${encodeURIComponent(to)}`)
      .then((r) => current && setResult({ key: rangeKey, entries: r.entries, error: "", reachesBackTo: r.reachesBackTo }))
      .catch((e: Error) => current && setResult({ key: rangeKey, entries: [], error: e.message, reachesBackTo: null }));
    return () => {
      current = false;
    };
  }, [days, rangeKey]);

  const loading = result.key !== rangeKey;
  const { entries, error, reachesBackTo } = result;
  const beyondHistory = reachesBackTo !== null && Date.parse(rangeKey) < Date.parse(reachesBackTo);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const key = dayKey(new Date(entry.at));
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [entries]);

  const today = dayKey(new Date());
  const shift = (months: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));
  const counts = {
    scheduled: entries.filter((e) => statusOf(e) === STATUS.scheduled).length,
    published: entries.filter((e) => statusOf(e) === STATUS.published).length,
    failed: entries.filter((e) => statusOf(e) === STATUS.failed).length,
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Calendar" subtitle="Every scheduled and published post in Social Streamline, including ones made outside this site.">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" aria-label="Previous month">
            Prev
          </button>
          <button
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            Today
          </button>
          <button onClick={() => shift(1)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" aria-label="Next month">
            Next
          </button>
        </div>
      </PageHeader>

      {error && <Banner tone="error">{error}</Banner>}
      {beyondHistory && reachesBackTo && (
        <Banner tone="warning">
          Social Streamline lists only the newest 100 published posts, back to {new Date(reachesBackTo).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Older
          posts are not shown; scheduled and failed posts always are.
        </Banner>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          {loading && <Spinner />}
          {(["scheduled", "published", "failed"] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS[key].dot}`} />
              {STATUS[key].label} {counts[key]}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-4">
        <Card className="min-w-0 flex-1 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dayKey(day);
              const items = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              return (
                <div key={key} className={`min-h-28 border-b border-r border-zinc-100 p-1.5 ${inMonth ? "bg-white" : "bg-zinc-50/60"}`}>
                  <div
                    className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      key === today ? "bg-zinc-900 font-semibold text-white" : inMonth ? "text-zinc-700" : "text-zinc-400"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.slice(0, 3).map((entry) => (
                      <button
                        key={entry.providerPostId}
                        onClick={() => setSelected(entry)}
                        className={`truncate rounded border px-1.5 py-0.5 text-left text-[11px] ${statusOf(entry).chip} ${
                          selected?.providerPostId === entry.providerPostId ? "ring-2 ring-zinc-900" : ""
                        }`}
                        title={entry.text}
                      >
                        {new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{" "}
                        {entry.platforms.map(platformName).join(", ")}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <button onClick={() => setSelected(items[3])} className="text-left text-[11px] text-zinc-500 underline">
                        {items.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {selected && (
          <Card className="w-80 shrink-0 self-start p-4">
            <div className="flex items-start justify-between gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusOf(selected).chip}`}>{statusOf(selected).label}</span>
              <button onClick={() => setSelected(null)} className="text-xs text-zinc-500 underline">
                Close
              </button>
            </div>
            <p className="mt-3 text-sm font-medium">
              {new Date(selected.at).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {selected.platforms.map(platformName).join(", ")}
              {selected.postId ? " - made on this site" : " - made in Social Streamline"}
            </p>
            {selected.mediaUrl &&
              (/\.(mp4|mov|webm)(\?|$)/i.test(selected.mediaUrl) ? (
                <video src={selected.mediaUrl} controls className="mt-3 w-full rounded-lg bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.mediaUrl} alt="" className="mt-3 w-full rounded-lg border border-zinc-200 object-cover" />
              ))}
            <p className="mt-3 whitespace-pre-line text-sm text-zinc-800">{selected.text || "(no text)"}</p>
            {selected.error && <p className="mt-3 text-sm text-amber-800">{selected.error}</p>}
            {selected.urls.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs">
                {selected.urls.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer" className="break-all text-sky-700 underline">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
