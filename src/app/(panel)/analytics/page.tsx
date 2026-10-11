"use client";

import { api } from "@/lib/client";
import type { AnalyticsRow, TimeSaved } from "@/lib/model";
import { useEffect, useState } from "react";

type AnalyticsResponse = { posts: AnalyticsRow[]; ads: AnalyticsRow[]; timeSaved: TimeSaved };

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
          <Table title="Posts" rows={data.posts} />
          <Table title="Ads" rows={data.ads} />
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

function Table({ title, rows }: { title: string; rows: AnalyticsRow[] }) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold">{title}</h2>
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
    </section>
  );
}
