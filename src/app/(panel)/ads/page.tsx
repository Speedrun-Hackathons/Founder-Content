"use client";

import { api } from "@/lib/client";
import { PLATFORMS, type Ad, type Platform, type Run, type Variant, type VariantLabel } from "@/lib/model";
import { useEffect, useState } from "react";

type RunFailure = { runId: string; platform: Platform; error: string };
type AdsResponse = { ads: Ad[]; failures: RunFailure[] };
type VariantStats = {
  adId: string;
  variantId: string;
  platform: Platform;
  label: VariantLabel;
  impressions: number;
  clicks: number;
  clickRate: number;
  standIn: true;
};
type RunGroup = { runId: string; run: Run | null; ads: Ad[]; failures: RunFailure[] };

const DEFAULT_PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin"];

export default function AdsPage() {
  const [chosen, setChosen] = useState<Platform[]>(DEFAULT_PLATFORMS);
  const [runs, setRuns] = useState<Run[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [failures, setFailures] = useState<RunFailure[]>([]);
  const [stats, setStats] = useState<VariantStats[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [r, a] = await Promise.all([api<{ runs: Run[] }>("/api/runs"), api<AdsResponse>("/api/ads")]);
      setRuns(r.runs);
      setAds(a.ads);
      setFailures(a.failures ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
    // Stand-in numbers are a nice-to-have; the Ads still show without them.
    api<{ adVariants: VariantStats[] }>("/api/analytics")
      .then((r) => setStats(r.adVariants ?? []))
      .catch(() => setStats([]));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  function toggle(platform: Platform) {
    setChosen((list) => (list.includes(platform) ? list.filter((p) => p !== platform) : [...list, platform]));
  }

  async function generate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ run: Run; ads: Ad[]; failures: { platform: Platform; error: string }[] }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ platforms: chosen }),
      });
      setNotice(
        `Run ${r.run.id} made ${r.ads.length} Ad(s)` +
          (r.failures.length > 0 ? `; ${r.failures.length} Platform(s) failed, see below.` : "."),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(ad: Ad, variant: Variant) {
    setError("");
    try {
      await api(`/api/ads/${ad.id}/winner`, { method: "POST", body: JSON.stringify({ variantId: variant.id }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function draft(variant: Variant) {
    setError("");
    try {
      const r = await api<{ post: { id: string } }>("/api/posts", { method: "POST", body: JSON.stringify({ variantId: variant.id }) });
      setNotice(`Draft ${r.post.id} created for ${variant.platform}. Open Content to schedule or publish it.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const groups = groupByRun(runs, ads, failures);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Ads</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((platform) => (
            <label key={platform} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={chosen.includes(platform)} onChange={() => toggle(platform)} disabled={busy} />
              {platform}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">TikTok and YouTube take video only, so they come back as failures here.</p>
        <button
          disabled={busy || chosen.length === 0}
          onClick={generate}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate two Variants per Platform"}
        </button>
        {busy && (
          <p role="status" className="mt-3 text-sm text-zinc-600">
            Generating two Variants per Platform… this takes up to a minute. Keep this page open.
          </p>
        )}
      </section>
      {groups.length === 0 && !busy && (
        <p className="mt-6 text-sm text-zinc-600">No Runs yet. Pick Platforms above and generate your first Ads.</p>
      )}
      <div className="mt-6 space-y-8">
        {groups.map((group) => (
          <RunSection key={group.runId} group={group} stats={stats} onPick={pick} onDraft={draft} />
        ))}
      </div>
    </div>
  );
}

function groupByRun(runs: Run[], ads: Ad[], failures: RunFailure[]): RunGroup[] {
  const ids = new Set<string>(runs.map((r) => r.id));
  for (const ad of ads) ids.add(ad.runId);
  for (const f of failures) ids.add(f.runId);
  const groups = [...ids].map((runId) => ({
    runId,
    run: runs.find((r) => r.id === runId) ?? null,
    ads: ads.filter((a) => a.runId === runId),
    failures: failures.filter((f) => f.runId === runId),
  }));
  const started = (g: RunGroup) => (g.run ? Date.parse(g.run.startedAt) : 0);
  return groups.sort((a, b) => started(b) - started(a));
}

function RunSection({
  group,
  stats,
  onPick,
  onDraft,
}: {
  group: RunGroup;
  stats: VariantStats[];
  onPick: (ad: Ad, variant: Variant) => void;
  onDraft: (variant: Variant) => void;
}) {
  const { run } = group;
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">
          Run <span className="font-mono text-base">{group.runId}</span>
        </h2>
        {run && <span className="text-sm text-zinc-500">Started {new Date(run.startedAt).toLocaleString()}</span>}
        {run && (
          <span className="text-sm text-zinc-500">
            Run time: {run.runTimeSeconds === null ? "in progress" : `${run.runTimeSeconds} s`}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {group.ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} stats={stats} onPick={onPick} onDraft={onDraft} />
        ))}
        {group.failures.map((f) => (
          <div key={f.platform} className="rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{f.platform}</h3>
              <span className="text-xs font-medium text-red-700">Failed</span>
            </div>
            <p className="mt-2 text-sm text-red-700">{f.error}</p>
          </div>
        ))}
      </div>
      {group.ads.length === 0 && group.failures.length === 0 && (
        <p className="mt-2 text-sm text-zinc-600">No Ads in this Run yet.</p>
      )}
    </section>
  );
}

function AdCard({
  ad,
  stats,
  onPick,
  onDraft,
}: {
  ad: Ad;
  stats: VariantStats[];
  onPick: (ad: Ad, variant: Variant) => void;
  onDraft: (variant: Variant) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{ad.platform}</h3>
        <span className="font-mono text-xs text-zinc-500">{ad.id}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {ad.variants.map((variant) => {
          const winner = ad.winnerVariantId === variant.id;
          const stat = stats.find((s) => s.adId === ad.id && s.variantId === variant.id);
          return (
            <div
              key={variant.id}
              className={`rounded-lg border p-3 ${winner ? "border-green-600 bg-green-50" : "border-zinc-200"}`}
            >
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Variant {variant.label}</span>
                <span>{variant.mediaKind}</span>
              </div>
              <Media variant={variant} />
              <p className="mt-2 text-sm">{variant.text}</p>
              <p className="mt-1 text-xs text-zinc-500">{variant.text.length} characters</p>
              <div className="mt-2 rounded-md bg-zinc-50 p-2 text-xs text-zinc-600">
                {stat ? (
                  <>
                    {stat.impressions} impressions, {stat.clicks} clicks, {(stat.clickRate * 100).toFixed(1)}% click rate
                  </>
                ) : (
                  "No numbers yet"
                )}
                <div className="mt-0.5 text-zinc-500">stand-in numbers</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onPick(ad, variant)}
                  disabled={winner}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:border-green-600 disabled:font-medium disabled:text-green-800"
                >
                  {winner ? "Winner" : "Pick as Winner"}
                </button>
                <button onClick={() => onDraft(variant)} className="rounded-md bg-zinc-900 px-3 py-1 text-xs text-white">
                  Make a draft
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Media({ variant }: { variant: Variant }) {
  if (variant.mediaUrls.length === 0) return null;
  const alt = `${variant.platform} Variant ${variant.label}`;
  if (variant.mediaKind === "carousel") {
    return (
      <div className="mt-2 flex gap-1 overflow-x-auto">
        {variant.mediaUrls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt={`${alt}, Carousel image ${i + 1}`} className="h-24 w-24 shrink-0 rounded-md object-cover" />
        ))}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={variant.mediaUrls[0]} alt={alt} className="mt-2 aspect-square w-full rounded-md object-cover" />
  );
}
