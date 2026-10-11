import type { Platform, VariantLabel } from "@/lib/model";
import { PLATFORM_RULES } from "@/lib/ads/platforms";

export const VARIANT_COLOR: Record<VariantLabel, string> = { A: "#2a78d6", B: "#eb6834" };

export function platformName(platform: Platform): string {
  return PLATFORM_RULES[platform].name;
}

export function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function runTime(seconds: number | null): string {
  if (seconds === null) return "Not published yet";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function Banner({ tone, children }: { tone: "error" | "notice" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    notice: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mt-4 flex gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {tone === "notice" ? <CheckIcon /> : <AlertIcon />}
      <div>{children}</div>
    </div>
  );
}

const TONES = {
  brand: { chip: "bg-brand-50 text-brand-600", bar: "bg-brand-500" },
  coral: { chip: "bg-coral-400/15 text-coral-500", bar: "bg-coral-400" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  sky: { chip: "bg-sky-50 text-sky-600", bar: "bg-sky-500" },
} as const;

export const ICONS = {
  run: "M5 4l14 8-14 8z",
  ad: "M5 5h6v14H5zM13 5h6v14h-6z",
  winner: "M8 4h8v5a4 4 0 0 1-8 0zM6 5H4v2a3 3 0 0 0 3 3M18 5h2v2a3 3 0 0 1-3 3M10 14h4v3h-4zM8 20h8",
  post: "M5 5h14v10H8l-3 3z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
} as const;

export type Tone = keyof typeof TONES;

export function Stat({
  label,
  value,
  hint,
  tone = "brand",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon?: keyof typeof ICONS;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-1 ${TONES[tone].bar}`} aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">{label}</div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONES[tone].chip}`}>
            <Icon path={ICONS[icon]} />
          </span>
        )}
      </div>
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

export function Icon({ path, className = "h-[18px] w-[18px]" }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function StandInBadge() {
  return (
    <span
      title="Stand-in numbers until an ads analytics source exists"
      className="inline-flex items-center rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-500"
    >
      Stand-in
    </span>
  );
}

export function VariantTag({ label }: { label: VariantLabel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: VARIANT_COLOR[label] }} aria-hidden />
      Variant {label}
    </span>
  );
}

export function WinnerTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
      <CheckIcon className="h-3.5 w-3.5" />
      Winner
    </span>
  );
}

// Click rate of A against B on one shared scale, so the longer bar is the higher rate.
export function RateBars({ rows }: { rows: { label: VariantLabel; clickRate: number }[] }) {
  const max = Math.max(...rows.map((r) => r.clickRate), 0.0001);
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 text-xs" title={`Variant ${row.label}: ${percent(row.clickRate)} click rate`}>
          <span className="w-4 font-medium text-zinc-600">{row.label}</span>
          <div className="h-2 flex-1 rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(row.clickRate / max) * 100}%`, backgroundColor: VARIANT_COLOR[row.label] }}
            />
          </div>
          <span className="w-12 text-right tabular-nums text-zinc-700">{percent(row.clickRate)}</span>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className = "h-4 w-4 shrink-0 mt-0.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" strokeLinecap="round" />
    </svg>
  );
}
