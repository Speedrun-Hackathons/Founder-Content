"use client";

import { api } from "@/lib/client";
import type { Ad, Run, TimeSaved } from "@/lib/model";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Card, PageHeader, Stat, platformName, runTime } from "../ads/_components/ui";

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [timeSaved, setTimeSaved] = useState<TimeSaved | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<{ runs: Run[] }>("/api/runs"), api<{ ads: Ad[] }>("/api/ads"), api<{ timeSaved: TimeSaved }>("/api/analytics")])
      .then(([r, a, t]) => {
        setRuns(r.runs);
        setAds(a.ads);
        setTimeSaved(t.timeSaved);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const minutes = timeSaved ? Math.round(timeSaved.totalRunSeconds / 60) : 0;
  const winners = ads.filter((a) => a.winnerVariantId).length;
  const recent = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Dashboard" subtitle="Your Runs, your Winners and the hours given back.">
        <Link href="/ads" className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">
          New Run
        </Link>
      </PageHeader>
      {error && <Banner tone="error">{error}</Banner>}

      <Card className="mt-6 grid gap-6 p-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="text-sm text-zinc-500">Time in Runs, from URL to first Post</div>
          <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
            {minutes}
            <span className="ml-2 text-xl font-medium text-zinc-500">min</span>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Across {timeSaved?.totalRuns ?? 0} finished Run{timeSaved?.totalRuns === 1 ? "" : "s"}, measured by the site.
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-5">
          <div className="text-sm text-zinc-500">By hand, from the survey</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {timeSaved ? `${timeSaved.surveyHoursPerWeekLow} to ${timeSaved.surveyHoursPerWeekHigh}` : "–"}
            <span className="ml-2 text-base font-medium text-zinc-500">hours a week</span>
          </div>
          {timeSaved && <p className="mt-2 text-xs text-zinc-500">{timeSaved.surveySource}</p>}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Runs started" value={String(runs.length)} />
        <Stat label="Ads generated" value={String(ads.length)} hint={ads.length > 0 ? `${ads.length * 2} Variants` : undefined} />
        <Stat label="Winners picked" value={`${winners} of ${ads.length}`} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recent Runs</h2>
        <Card className="mt-4 overflow-x-auto">
          {recent.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-600">No Runs yet.</p>
              <p className="mt-1 text-sm text-zinc-500">
                Add your Company URL on the{" "}
                <Link className="font-medium text-zinc-900 underline" href="/company">
                  Company
                </Link>{" "}
                page, approve the Brief, then start a Run on{" "}
                <Link className="font-medium text-zinc-900 underline" href="/ads">
                  Ads
                </Link>
                .
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Run</th>
                  <th className="px-5 py-2.5 font-medium">Platforms</th>
                  <th className="px-5 py-2.5 font-medium">Started</th>
                  <th className="px-5 py-2.5 font-medium">Run time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((run) => (
                  <tr key={run.id} className="border-t border-zinc-100">
                    <td className="px-5 py-3 font-mono text-xs">{run.id}</td>
                    <td className="px-5 py-3">{run.platforms.map(platformName).join(", ")}</td>
                    <td className="px-5 py-3 text-zinc-600">{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ring-1 ${
                          run.runTimeSeconds === null ? "text-zinc-500 ring-zinc-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                        }`}
                      >
                        {runTime(run.runTimeSeconds)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
