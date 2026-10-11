export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#6236e8" />
      <rect x="7" y="9" width="8" height="14" rx="2.5" fill="#ffffff" />
      <rect x="17" y="9" width="8" height="14" rx="2.5" fill="#ff8a65" />
      <path d="M19 16.2l1.6 1.6 3-3.2" fill="none" stroke="#2a1a66" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`whitespace-nowrap font-display text-lg font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>
        SocialCoFounder
      </span>
    </span>
  );
}
