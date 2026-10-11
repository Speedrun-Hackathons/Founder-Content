"use client";

import { Banner, Card, PageHeader, Spinner, platformName } from "@/app/(panel)/ads/_components/ui";
import { api } from "@/lib/client";
import { PLATFORMS, type Platform } from "@/lib/model";
import type { Job, LibraryItem } from "@/lib/social/client";
import { useCallback, useEffect, useRef, useState } from "react";

type ClipRow = { facecamUrl: string; desktopUrl: string };
type CaptionResult = { platform: Platform; ok: boolean; error?: string };

const TERMINAL = ["succeeded", "failed", "cancelled"];
const POSITIONS = ["lower_right", "lower_center", "lower_left", "center_left", "upper_left", "top_center", "upper_right", "center_right"];
const JOB_STYLE: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-sky-50 text-sky-700",
  needs_action: "bg-amber-50 text-amber-800",
  succeeded: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

const label = (value: string) => value.replace(/_/g, " ");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function StudioPage() {
  const [credits, setCredits] = useState<number | null>(null);
  const [videos, setVideos] = useState<LibraryItem[]>([]);
  const [clips, setClips] = useState<ClipRow[]>([{ facecamUrl: "", desktopUrl: "" }]);
  const [format, setFormat] = useState<"short" | "long">("short");
  const [options, setOptions] = useState({ captions: true, removeSilence: true, removeFillerWords: false, stacked: false, faceTracking: false });
  const [position, setPosition] = useState("lower_right");
  const [scale, setScale] = useState(25);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const jobsRef = useRef<Job[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const loadJobs = useCallback(() => {
    api<{ items: Job[] }>("/api/social/jobs")
      .then((r) => setJobs(r.items.filter((j) => j.kind === "short_video" || j.kind === "long_video")))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    api<{ credits: { available: number } }>("/api/social/me")
      .then((r) => setCredits(r.credits.available))
      .catch(() => setCredits(null));
    api<{ items: LibraryItem[] }>("/api/social/library?kind=video")
      .then((r) => setVideos(r.items))
      .catch((e: Error) => setError(e.message));
    loadJobs();
  }, [loadJobs]);

  // Poll the jobs that are still moving every five seconds.
  useEffect(() => {
    const timer = setInterval(async () => {
      const moving = jobsRef.current.filter((j) => !TERMINAL.includes(j.status));
      if (moving.length === 0) return;
      const fresh = await Promise.all(
        moving.map((j) =>
          api<{ job: Job }>(`/api/social/jobs/${j.id}`)
            .then((r) => r.job)
            .catch(() => j),
        ),
      );
      setJobs((current) => current.map((j) => fresh.find((f) => f.id === j.id) ?? j));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function upload(files: FileList | null, index: number, field: keyof ClipRow) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/social/media", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? `Upload failed (${response.status})`);
      setClips((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: body.url } : row)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    const filled = clips.filter((c) => c.facecamUrl);
    if (!window.confirm(`Start a ${format} render from ${filled.length} clip${filled.length === 1 ? "" : "s"}? It spends Social Streamline credits.`)) return;
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const body =
        format === "short"
          ? { format, clips: filled, mode: options.stacked ? "stacked" : "facecam_only", captions: options.captions, removeSilence: options.removeSilence, removeFillerWords: options.removeFillerWords }
          : { format, clips: filled, facecamPosition: position, facecamScale: scale, captions: options.captions, removeSilence: options.removeSilence, faceTracking: options.faceTracking };
      const r = await api<{ job: Job; credits: { available: number } }>("/api/social/videos", { method: "POST", body: JSON.stringify(body) });
      setJobs((current) => [r.job, ...current]);
      setCredits(r.credits.available);
      setNotice("Render queued. It updates below as it runs.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function cancel(job: Job) {
    if (!window.confirm("Cancel this render? Its held credits are released and the job is removed.")) return;
    try {
      await api(`/api/social/jobs/${job.id}/cancel`, { method: "POST" });
      setJobs((current) => current.filter((j) => j.id !== job.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const set = (key: keyof typeof options) => (e: React.ChangeEvent<HTMLInputElement>) => setOptions((o) => ({ ...o, [key]: e.target.checked }));
  const ready = clips.some((c) => c.facecamUrl) && !(format === "short" && options.stacked && clips.some((c) => c.facecamUrl && !c.desktopUrl));

  return (
    <div className="max-w-5xl">
      <PageHeader title="Studio" subtitle="Render vertical shorts and landscape videos from your clips, then write posts for them.">
        <div className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm">{credits === null ? "Credits unknown" : `${credits.toLocaleString("en-US")} credits`}</div>
      </PageHeader>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="notice">{notice}</Banner>}

      <Card className="mt-6 p-5">
        <h2 className="text-lg font-semibold">New render</h2>
        <div className="mt-3 flex gap-2">
          {(["short", "long"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`rounded-lg border px-4 py-2 text-left text-sm ${format === f ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"}`}
            >
              <div className="font-medium">{f === "short" ? "Short, vertical" : "Long, landscape"}</div>
              <div className={`text-xs ${format === f ? "text-zinc-300" : "text-zinc-500"}`}>
                {f === "short" ? "TikTok, Reels, Shorts" : "YouTube, facecam over screen"}
              </div>
            </button>
          ))}
        </div>

        <h3 className="mt-5 text-sm font-medium">Clips, in order</h3>
        <p className="text-xs text-zinc-500">Each clip needs a facecam video. A screen capture is optional, and required on every clip for stacked shorts.</p>
        <div className="mt-2 flex flex-col gap-3">
          {clips.map((clip, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-zinc-200 p-3 md:grid-cols-2">
              {(["facecamUrl", "desktopUrl"] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-zinc-600">{field === "facecamUrl" ? `Clip ${index + 1}: facecam` : "Screen capture (optional)"}</label>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={clip[field]}
                    onChange={(e) => setClips((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: e.target.value } : row)))}
                  >
                    <option value="">{field === "facecamUrl" ? "Choose a video" : "None"}</option>
                    {clip[field] && !videos.some((v) => v.url === clip[field]) && <option value={clip[field]}>Uploaded just now</option>}
                    {videos.map((v) => (
                      <option key={v.id} value={v.url}>
                        {v.title || v.id}
                        {v.durationSec ? ` (${Math.round(v.durationSec)} s)` : ""}
                      </option>
                    ))}
                  </select>
                  <input type="file" accept="video/*" className="mt-1 block text-xs" onChange={(e) => upload(e.target.files, index, field)} />
                </div>
              ))}
              {clips.length > 1 && (
                <button onClick={() => setClips((rows) => rows.filter((_, i) => i !== index))} className="justify-self-start text-xs text-zinc-600 underline">
                  Remove clip
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setClips((rows) => [...rows, { facecamUrl: "", desktopUrl: "" }])}
          disabled={clips.length >= 20}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50"
        >
          Add clip
        </button>
        {uploading && (
          <span className="ml-3 inline-flex items-center gap-2 text-sm text-zinc-600">
            <Spinner /> Uploading
          </span>
        )}

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.captions} onChange={set("captions")} /> Burned-in captions
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.removeSilence} onChange={set("removeSilence")} /> Cut silences
          </label>
          {format === "short" ? (
            <>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={options.removeFillerWords} onChange={set("removeFillerWords")} /> Cut filler words
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={options.stacked} onChange={set("stacked")} /> Stack screen above facecam
              </label>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={options.faceTracking} onChange={set("faceTracking")} /> Keep the speaker centred
              </label>
              <label className="flex items-center gap-2">
                Facecam
                <select value={position} onChange={(e) => setPosition(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1">
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Size {scale}%
                <input type="range" min={10} max={60} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
              </label>
            </>
          )}
        </div>

        <button onClick={start} disabled={!ready || starting || uploading} className="mt-5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {starting ? "Starting..." : "Start render"}
        </button>
      </Card>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Renders</h2>
        <button onClick={loadJobs} className="rounded-md border border-zinc-300 px-3 py-1 text-sm">
          Refresh
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">No renders yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onCancel={() => cancel(job)} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const video = job.outputUrls[0];
  const moving = !TERMINAL.includes(job.status);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{job.kind === "short_video" ? "Short" : "Long"} render</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${JOB_STYLE[job.status] ?? JOB_STYLE.queued}`}>{label(job.status)}</span>
        {job.detail && job.detail !== job.status && <span className="text-xs text-zinc-500">{label(job.detail)}</span>}
        {job.progress !== null && moving && <span className="text-xs text-zinc-500">{Math.round(job.progress)}%</span>}
        {moving && <Spinner />}
        <span className="ml-auto text-xs text-zinc-500">{job.createdAt && new Date(job.createdAt).toLocaleString("en-US")}</span>
        {(job.status === "queued" || job.status === "running") && (
          <button onClick={onCancel} className="rounded-md border border-zinc-300 px-3 py-1 text-xs">
            Cancel
          </button>
        )}
      </div>
      {job.status === "needs_action" && <p className="mt-2 text-sm text-amber-800">This render is waiting on you. Open it in Social Streamline to continue.</p>}
      {job.error && <p className="mt-2 text-sm text-red-700">{job.error}</p>}
      {video && (
        <div className="mt-3 grid gap-4 md:grid-cols-[240px_1fr]">
          <video src={video} controls className={`w-full rounded-lg bg-black ${job.kind === "short_video" ? "aspect-[9/16]" : "aspect-video"}`} />
          <WritePosts videoUrl={video} vertical={job.kind === "short_video"} />
        </div>
      )}
    </Card>
  );
}

/** Transcribes the finished video, then drafts one caption per Platform with the video attached. */
function WritePosts({ videoUrl, vertical }: { videoUrl: string; vertical: boolean }) {
  const [chosen, setChosen] = useState<Platform[]>(vertical ? ["tiktok", "instagram", "youtube"] : ["youtube", "linkedin"]);
  const [step, setStep] = useState<"" | "transcribing" | "writing">("");
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [error, setError] = useState("");

  async function write() {
    setError("");
    setResults([]);
    try {
      setStep("transcribing");
      let transcript = "";
      for (let attempt = 0; attempt < 36; attempt++) {
        const { transcription } = await api<{ transcription: { status: string; text: string | null; error: string | null } }>("/api/social/transcriptions", {
          method: "POST",
          body: JSON.stringify({ mediaUrl: videoUrl }),
        });
        if (transcription.text) {
          transcript = transcription.text;
          break;
        }
        if (/fail|error/i.test(transcription.status)) throw new Error(transcription.error ?? "The transcription failed.");
        await sleep(5000);
      }
      if (!transcript) throw new Error("The transcription is still running after three minutes. Try again shortly.");
      setStep("writing");
      const r = await api<{ results: CaptionResult[] }>("/api/posts/captions", {
        method: "POST",
        body: JSON.stringify({ platforms: chosen, mediaUrl: videoUrl, transcript }),
      });
      setResults(r.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep("");
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold">Write posts for this video</h3>
      <p className="text-xs text-zinc-500">It is transcribed, then each Platform gets a caption from the transcript, the Brief and the Voice, saved as a draft with the video attached.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => {
          const on = chosen.includes(p);
          return (
            <button
              key={p}
              onClick={() => setChosen((c) => (on ? c.filter((x) => x !== p) : [...c, p]))}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700"}`}
            >
              {platformName(p)}
            </button>
          );
        })}
      </div>
      <button onClick={write} disabled={step !== "" || chosen.length === 0} className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {step === "transcribing" ? "Transcribing..." : step === "writing" ? "Writing captions..." : "Write drafts"}
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
            <a href="/content" className="text-sky-700 underline">
              Review the drafts on Content
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
