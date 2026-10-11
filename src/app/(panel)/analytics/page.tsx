"use client";

import { api } from "@/lib/client";
import type { AnalyticsRow, Platform, TimeSaved, VariantLabel } from "@/lib/model";
import { useEffect, useState } from "react";

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
    <div>
      <h1 className="text-2xl font-semibold">Analytics</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <PostsTable rows={data.posts} source={data.postsSource} error={data.postsError} />
          <VariantTable rows={data.adVariants ?? []} />
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold">Time saved</h2>
            <p className="mt-2 text-sm">
              {data.timeSaved.totalRuns} finished Run(s), {Math.round(data.timeSaved.totalRunSeconds / 60)} minute(s) in total, against{" "}
              {data.timeSaved.surveyHoursPerWeekLow} to {data.timeSaved.surveyHoursPerWeekHigh} hours a week by hand.
            </p>
            <p className="mt-1 text-xs text-zinc-500">{data.timeSaved.surveySource}</p>
          </section>
        </>
      )}
    </div>
  );
}

function PostsTable({ rows, source, error }: { rows: AnalyticsRow[]; source: string; error?: string }) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold">Posts</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Nothing published yet.</p>
      ) : (
        <table className="mt-2 w-full max-w-2xl text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1">Platform</th>
              <th>Posts</th>
              <th>Impressions</th>
              <th>Engagements</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.platform} className="border-t border-zinc-200">
                <td className="py-1">{row.platform}</td>
                <td>{row.posts}</td>
                <td>{row.impressions}</td>
                <td>{row.engagements}</td>
                <td>{row.standIn ? "stand-in numbers" : "measured"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {source && <p className="mt-2 text-xs text-zinc-500">{source}</p>}
      {error && <p className="mt-2 max-w-2xl rounded-md bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    </section>
  );
}

function VariantTable({ rows }: { rows: AdVariantRow[] }) {
  return (
    <section className="mt-8">
      <h2 className="font-semibold">Ad Variants</h2>
      <p className="mt-1 text-xs text-zinc-500">Stand-in numbers until an ads analytics source exists.</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">No Ads yet.</p>
      ) : (
        <table className="mt-2 w-full max-w-2xl text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1">Platform</th>
              <th>Variant</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>Click rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.adId}:${row.variantId}`} className="border-t border-zinc-200">
                <td className="py-1">{row.platform}</td>
                <td>{row.label}</td>
                <td>{row.impressions}</td>
                <td>{row.clicks}</td>
                <td>{(row.clickRate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
