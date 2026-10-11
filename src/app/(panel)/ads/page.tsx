"use client";

import { PLATFORM_RULES } from "@/lib/ads/platforms";
import { api } from "@/lib/client";
import { PLATFORMS, type Ad, type Platform, type Run, type Variant, type VariantLabel } from "@/lib/model";
import { useEffect, useState } from "react";
import {
  AlertIcon,
  Banner,
  Card,
  ICONS,
  Icon,
  PageHeader,
  RateBars,
  Spinner,
  StandInBadge,
  VariantTag,
  VARIANT_COLOR,
  WinnerTag,
  compact,
  percent,
  platformName,
  runTime,
} from "./_components/ui";

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

function videoOnly(platform: Platform): boolean {
  return PLATFORM_RULES[platform].mediaKind === "video";
}

function angleOf(variant: Variant): string {
  return (variant as Variant & { angle?: string }).angle ?? "";
}

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
    const results = await Promise.allSettled(
      chosen.map((platform) =>
        api<{ run: Run; ads: Ad[]; failures: { platform: Platform; error: string }[] }>("/api/runs", {
          method: "POST",
          body: JSON.stringify({ platforms: [platform] }),
        }),
      ),
    );
    const made = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value.ads.length : 0), 0);
    const refused = results.flatMap((r, i) => (r.status === "rejected" ? [`${platformName(chosen[i])}: ${(r.reason as Error).message}`] : []));
    const failed = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value.failures.length : 0), 0) + refused.length;
    setNotice(
      `${made} Ad${made === 1 ? "" : "s"} made across ${chosen.length} Platform${chosen.length === 1 ? "" : "s"}` +
        (failed > 0 ? `. ${failed} failed, see the reason below.` : "."),
    );
    if (refused.length > 0) setError(refused.join(" "));
    await load();
    setBusy(false);
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
      setNotice(`Draft ${r.post.id} saved for ${platformName(variant.platform)}. Open Content to schedule or publish it.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const groups = groupByRun(runs, ads, failures);
  const images = chosen.reduce((sum, p) => sum + PLATFORM_RULES[p].images * 2, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ads" subtitle="Two Variants per Platform. Compare A and B, then pick the Winner by hand." />
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="notice">{notice}</Banner>}

      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon path={ICONS.run} className="h-3.5 w-3.5" />
            </span>
            New Run
          </h2>
          <span className="text-xs text-zinc-500">Uses your approved Brief and Voice</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PLATFORMS.map((platform) => {
            const on = chosen.includes(platform);
            const video = videoOnly(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={on}
                disabled={busy || video}
                onClick={() => toggle(platform)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  on ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400"
                } disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400`}
              >
                <span className="font-medium">{platformName(platform)}</span>
                <span className={`text-[11px] ${on ? "text-zinc-300" : "text-zinc-400"}`}>
                  {video ? "Video only" : PLATFORM_RULES[platform].mediaKind === "carousel" ? "Carousel" : "Image"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
          <p className="text-xs text-zinc-500">
            {chosen.length} Platform{chosen.length === 1 ? "" : "s"}, {chosen.length * 2} Variants, {images} images. TikTok and YouTube
            Ads need video, which comes from the render flow.
          </p>
          <button
            disabled={busy || chosen.length === 0}
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {busy && <Spinner />}
            {busy ? "Generating..." : "Generate Variants"}
          </button>
        </div>
      </Card>

      {busy && <PendingRun platforms={chosen} />}

      {groups.length === 0 && !busy && (
        <Card className="mt-8 border-dashed p-10 text-center shadow-none">
          <h2 className="font-semibold">No Runs yet</h2>
          <p className="mt-1 text-sm text-zinc-500">Choose Platforms above and generate your first A/B pair.</p>
        </Card>
      )}

      <div className="mt-8 space-y-10">
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

function PendingRun({ platforms }: { platforms: Platform[] }) {
  return (
    <section className="mt-8" role="status">
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Spinner />
        Writing Variant A and B and making images. This takes up to a minute; keep this page open.
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {platforms.map((platform) => (
          <Card key={platform} className="p-5">
            <div className="font-semibold">{platformName(platform)}</div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {(["A", "B"] as const).map((label) => (
                <div key={label} className="animate-pulse space-y-2">
                  <div className="aspect-[4/3] rounded-xl bg-zinc-100" />
                  <div className="h-3 w-4/5 rounded bg-zinc-100" />
                  <div className="h-3 w-3/5 rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
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
  const winners = group.ads.filter((a) => a.winnerVariantId).length;
  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden />
        <h2 className="text-lg font-semibold">Run</h2>
        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">{group.runId}</span>
        {run && <span className="text-sm text-zinc-500">{new Date(run.startedAt).toLocaleString()}</span>}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <Pill>
            {group.ads.length} Ad{group.ads.length === 1 ? "" : "s"}
          </Pill>
          <Pill>
            {winners} of {group.ads.length} Winners picked
          </Pill>
          {group.failures.length > 0 && <Pill tone="red">{group.failures.length} failed</Pill>}
          {run && <Pill>Run time: {runTime(run.runTimeSeconds)}</Pill>}
        </div>
      </div>
      {group.failures.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {group.failures.map((f) => (
            <div key={f.platform} className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertIcon />
              <div>
                <div className="font-semibold">{platformName(f.platform)} failed</div>
                <p className="mt-0.5 text-red-700">{f.error}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-4">
        {group.ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} stats={stats} onPick={onPick} onDraft={onDraft} />
        ))}
      </div>
      {group.ads.length === 0 && group.failures.length === 0 && <p className="mt-4 text-sm text-zinc-500">No Ads in this Run yet.</p>}
    </section>
  );
}

function Pill({ tone = "zinc", children }: { tone?: "zinc" | "red"; children: React.ReactNode }) {
  const styles = tone === "red" ? "bg-red-50 text-red-700 ring-red-200" : "bg-white text-zinc-600 ring-zinc-200";
  return <span className={`rounded-full px-2.5 py-1 ring-1 ${styles}`}>{children}</span>;
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
  const rule = PLATFORM_RULES[ad.platform];
  const statFor = (variant: Variant) => stats.find((s) => s.adId === ad.id && s.variantId === variant.id);
  const rates = ad.variants.flatMap((v) => {
    const s = statFor(v);
    return s ? [{ label: v.label, clickRate: s.clickRate }] : [];
  });
  const leader = rates.length === 2 && rates[0].clickRate !== rates[1].clickRate
    ? rates[0].clickRate > rates[1].clickRate ? "A" : "B"
    : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{rule.name}</h3>
          <span className="text-xs text-zinc-500">{rule.mediaKind === "carousel" ? `Carousel, ${rule.images} images` : "Image Ad"}</span>
        </div>
        <span className="text-xs text-zinc-500">{ad.winnerVariantId ? "Winner picked" : "Pick a Winner"}</span>
      </div>
      <div className="grid gap-px bg-zinc-100 md:grid-cols-2">
        {ad.variants.map((variant) => (
          <VariantPanel
            key={variant.id}
            variant={variant}
            maxChars={rule.maxChars}
            stat={statFor(variant)}
            winner={ad.winnerVariantId === variant.id}
            onPick={() => onPick(ad, variant)}
            onDraft={() => onDraft(variant)}
          />
        ))}
      </div>
      {rates.length === 2 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-100 bg-zinc-50 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <span className="font-medium">Click rate</span>
            <StandInBadge />
          </div>
          <div className="min-w-48 flex-1">
            <RateBars rows={rates} />
          </div>
          <span className="text-xs text-zinc-500">{leader ? `Variant ${leader} leads on stand-in numbers` : "A and B are level"}</span>
        </div>
      )}
    </Card>
  );
}

function VariantPanel({
  variant,
  maxChars,
  stat,
  winner,
  onPick,
  onDraft,
}: {
  variant: Variant;
  maxChars: number;
  stat: VariantStats | undefined;
  winner: boolean;
  onPick: () => void;
  onDraft: () => void;
}) {
  const angle = angleOf(variant);
  const over = variant.text.length > maxChars;
  return (
    <div
      className={`flex flex-col border-t-4 bg-white p-5 ${winner ? "ring-2 ring-inset ring-emerald-500" : ""}`}
      style={{ borderTopColor: VARIANT_COLOR[variant.label] }}
    >
      <div className="flex h-6 items-center justify-between gap-2">
        <VariantTag label={variant.label} />
        {winner && <WinnerTag />}
      </div>
      {angle && <div className="mt-1 text-xs text-zinc-500">Angle: {angle}</div>}
      <Media variant={variant} />
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-800">{variant.text}</p>
      <div className={`mt-2 text-xs tabular-nums ${over ? "text-red-700" : "text-zinc-400"}`}>
        {variant.text.length} / {maxChars} characters
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 text-center">
        <Metric label="Impressions" value={stat ? compact(stat.impressions) : "-"} />
        <Metric label="Clicks" value={stat ? compact(stat.clicks) : "-"} />
        <Metric label="Click rate" value={stat ? percent(stat.clickRate) : "-"} />
      </dl>
      <div className="mt-4 flex gap-2 pt-1">
        <button
          onClick={onPick}
          disabled={winner}
          className="flex-1 rounded-xl border border-brand-600 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-600 hover:text-white disabled:border-emerald-600 disabled:bg-emerald-600 disabled:text-white"
        >
          {winner ? "Winner" : "Pick as Winner"}
        </button>
        <button onClick={onDraft} className="rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
          Make a draft
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Media({ variant }: { variant: Variant }) {
  const [slide, setSlide] = useState(0);
  if (variant.mediaUrls.length === 0) return null;
  const alt = `${platformName(variant.platform)} Variant ${variant.label}`;
  const current = Math.min(slide, variant.mediaUrls.length - 1);
  return (
    <div className="mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variant.mediaUrls[current]}
        alt={variant.mediaUrls.length > 1 ? `${alt}, Carousel image ${current + 1} of ${variant.mediaUrls.length}` : alt}
        className="aspect-[4/3] w-full rounded-xl bg-zinc-100 object-cover"
      />
      {variant.mediaUrls.length > 1 && (
        <div className="mt-2 flex gap-2">
          {variant.mediaUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setSlide(i)}
              aria-label={`Show Carousel image ${i + 1}`}
              aria-current={i === current}
              className={`overflow-hidden rounded-lg ring-2 ${i === current ? "ring-zinc-900" : "ring-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-12 w-12 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
