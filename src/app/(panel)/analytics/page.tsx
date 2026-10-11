"use client";

import { api } from "@/lib/client";
import type { AnalyticsRow, Platform, TimeSaved, VariantLabel } from "@/lib/model";
import { useEffect, useState } from "react";
import {
  Banner,
  Card,
  PageHeader,
  RateBars,
  StandInBadge,
  Stat,
  VariantTag,
  compact,
  percent,
  platformName,
} from "../ads/_components/ui";

type AdVariantRow = {
  adId: string;
  variantId: string;
  platform: Platform;
  label: VariantLabel;
  impressions: number;
  clicks: number;
  clickRate: number;
  standIn: true;
};

type AnalyticsResponse = {
  posts: AnalyticsRow[];
  ads: AnalyticsRow[];
  adVariants: AdVariantRow[];
  timeSaved: TimeSaved;
  postsSource: string;
  postsError?: string;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AnalyticsResponse>("/api/analytics")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Analytics" subtitle="Reach and engagement for your Posts, and how each Ad Variant compares." />
      {error && <Banner tone="error">{error}</Banner>}
      {data && (
        <>
          <PostsSection rows={data.posts} source={data.postsSource} error={data.postsError} />
          <VariantSection rows={data.adVariants ?? []} />
          <TimeSavedSection timeSaved={data.timeSaved} />
        </>
      )}
    </div>
  );
}

function PostsSection({ rows, source, error }: { rows: AnalyticsRow[]; source: string; error?: string }) {
  const total = (key: "posts" | "impressions" | "engagements") => rows.reduce((sum, r) => sum + r[key], 0);
  const impressions = total("impressions");
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Posts</h2>
        <span className="text-xs text-zinc-500">Source: {source}</span>
      </div>
      {error && <Banner tone="warning">The posting service did not answer: {error}</Banner>}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Posts published" value={compact(total("posts"))} />
        <Stat label="Impressions" value={compact(impressions)} />
        <Stat
          label="Engagements"
          value={compact(total("engagements"))}
          hint={impressions > 0 ? `${percent(total("engagements") / impressions)} of impressions` : undefined}
        />
      </div>
      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Nothing published yet. Publish a draft from Content to see numbers here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Platform</th>
                <th className="px-5 py-2.5 text-right font-medium">Posts</th>
                <th className="px-5 py-2.5 text-right font-medium">Impressions</th>
                <th className="px-5 py-2.5 text-right font-medium">Engagements</th>
                <th className="px-5 py-2.5 font-medium">Numbers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.platform} className="border-t border-zinc-100">
                  <td className="px-5 py-3 font-medium">{platformName(row.platform)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row.posts}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row.impressions.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row.engagements.toLocaleString()}</td>
                  <td className="px-5 py-3">{row.standIn ? <StandInBadge /> : <span className="text-xs text-zinc-600">Measured</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

function VariantSection({ rows }: { rows: AdVariantRow[] }) {
  const byAd = new Map<string, AdVariantRow[]>();
  for (const row of rows) byAd.set(row.adId, [...(byAd.get(row.adId) ?? []), row]);
  const pairs = [...byAd.entries()].map(([adId, list]) => ({
    adId,
    platform: list[0].platform,
    rows: [...list].sort((a, b) => a.label.localeCompare(b.label)),
  }));
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Ad Variants</h2>
        <StandInBadge />
      </div>
      <p className="mt-1 text-sm text-zinc-500">Stand-in numbers until an ads analytics source exists. Use them to try the flow, not to judge an Ad.</p>
      <Card className="mt-4 overflow-x-auto">
        {pairs.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No Ads yet. Generate a Run on the Ads page.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Ad</th>
                <th className="px-5 py-2.5 font-medium">Variant</th>
                <th className="px-5 py-2.5 text-right font-medium">Impressions</th>
                <th className="px-5 py-2.5 text-right font-medium">Clicks</th>
                <th className="w-64 px-5 py-2.5 font-medium">Click rate</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) =>
                pair.rows.map((row, i) => (
                  <tr key={row.variantId} className={i === 0 ? "border-t border-zinc-200" : ""}>
                    {i === 0 && (
                      <td rowSpan={pair.rows.length} className="px-5 py-3 align-top">
                        <div className="font-medium">{platformName(pair.platform)}</div>
                        <div className="font-mono text-[11px] text-zinc-400">{pair.adId}</div>
                      </td>
                    )}
                    <td className="px-5 py-2.5">
                      <VariantTag label={row.label} />
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{row.impressions.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{row.clicks.toLocaleString()}</td>
                    {i === 0 && (
                      <td rowSpan={pair.rows.length} className="px-5 py-3 align-middle">
                        <RateBars rows={pair.rows} />
                      </td>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

function TimeSavedSection({ timeSaved }: { timeSaved: TimeSaved }) {
  const minutes = Math.round(timeSaved.totalRunSeconds / 60);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Time saved</h2>
      <Card className="mt-4 p-5">
        <p className="text-sm text-zinc-700">
          {timeSaved.totalRuns} finished Run{timeSaved.totalRuns === 1 ? "" : "s"}, {minutes} minute{minutes === 1 ? "" : "s"} in total, against{" "}
          {timeSaved.surveyHoursPerWeekLow} to {timeSaved.surveyHoursPerWeekHigh} hours a week by hand.
        </p>
        <p className="mt-2 text-xs text-zinc-500">{timeSaved.surveySource}</p>
      </Card>
    </section>
  );
}
