"use client";

import { api } from "@/lib/client";
import type { Run, TimeSaved } from "@/lib/model";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [timeSaved, setTimeSaved] = useState<TimeSaved | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<{ runs: Run[] }>("/api/runs"), api<{ timeSaved: TimeSaved }>("/api/analytics")])
      .then(([r, a]) => {
        setRuns(r.runs);
        setTimeSaved(a.timeSaved);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const minutes = timeSaved ? Math.round(timeSaved.totalRunSeconds / 60) : 0;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Runs finished" value={String(timeSaved?.totalRuns ?? 0)} />
        <Stat label="Minutes spent in Runs" value={String(minutes)} />
        <Stat
          label="Hours a week by hand, from the survey"
          value={timeSaved ? `${timeSaved.surveyHoursPerWeekLow} to ${timeSaved.surveyHoursPerWeekHigh}` : "-"}
        />
      </div>
      {timeSaved && <p className="mt-3 text-xs text-zinc-500">{timeSaved.surveySource}</p>}
      <h2 className="mt-10 text-lg font-semibold">Recent Runs</h2>
      {runs.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">
          No Runs yet. Start on the <Link className="underline" href="/company">Company</Link> page.
        </p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1">Run</th>
              <th>Platforms</th>
              <th>Started</th>
              <th>Run time</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-zinc-200">
                <td className="py-1 font-mono">{run.id}</td>
                <td>{run.platforms.join(", ")}</td>
                <td>{new Date(run.startedAt).toLocaleTimeString()}</td>
                <td>{run.runTimeSeconds === null ? "in progress" : `${run.runTimeSeconds} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </div>
  );
}
