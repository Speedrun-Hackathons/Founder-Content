import { auth } from "@/auth";
import { Logo } from "@/components/logo";
import { PLATFORMS, SURVEY_SOURCE } from "@/lib/model";
import { PLATFORM_RULES } from "@/lib/ads/platforms";
import Link from "next/link";

const PROBLEMS = [
  {
    stat: "1 to 3 hours",
    title: "A week, gone to posts",
    body: "Writing captions, making images, cutting video and scheduling it all, every week, by hand.",
  },
  {
    stat: "9 apps",
    title: "Tools all over the place",
    body: "A writer here, an image tool there, a scheduler somewhere else, and a login for every Platform.",
  },
  {
    stat: "1 guess",
    title: "No idea which Ad works",
    body: "You write one version, post it and hope. Nobody has time to make two and compare them.",
  },
  {
    stat: "0 posts",
    title: "It stops when you get busy",
    body: "The week you ship or sell is the week your content goes quiet.",
  },
];

const STEPS = [
  { title: "Paste your Company URL", body: "Add a deck or a product sheet if you have one. The site reads it all." },
  { title: "Approve the Brief and the Voice", body: "Read what we understood about your product and how you sound. Edit anything." },
  { title: "Generate two Variants per Platform", body: "Posts, images, Carousels and Ads, each in an A and a B, sized for each Platform." },
  { title: "Pick the Winner, schedule the rest", body: "Compare A and B side by side, pick by hand, then publish now or at a send time." },
];

const FEATURES = [
  { title: "Brief and Voice", body: "One source of truth about your product and your tone, with banned words you set.", icon: "M4 6h16M4 12h10M4 18h7" },
  { title: "Posts per Platform", body: "Captions written for X, LinkedIn and the rest, each within its own limits.", icon: "M5 5h14v10H8l-3 3z" },
  { title: "Images and Carousels", body: "On-brand images for every post, and Carousels that tell one idea across slides.", icon: "M4 5h16v14H4zM8 14l3-3 5 5M14 10h.01" },
  { title: "A/B Ads with a Winner", body: "Every Ad comes in two Variants with different angles. You choose what keeps running.", icon: "M5 5h6v14H5zM13 5h6v14h-6zM15 12l1.5 1.5L19 11" },
  { title: "Schedule or publish", body: "Drafts first, always. Then a send time, or publish on the spot for a launch.", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { title: "One analytics panel", body: "Reach and engagement for Posts, and numbers for each Variant, without opening nine apps.", icon: "M5 19V9M12 19V5M19 19v-7" },
  { title: "Run time, measured", body: "Every Run is timed from URL to first Post, so the hours you get back are counted.", icon: "M4 12h4l2-5 4 10 2-5h4" },
  { title: "Video from your clips", body: "Short vertical cuts for TikTok and Reels, long ones for YouTube.", icon: "M4 6h12v12H4zM16 10l4-2v8l-4-2", soon: true },
];

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const cta = signedIn ? { href: "/dashboard", label: "Open your dashboard" } : { href: "/signin", label: "Sign in" };

  return (
    <div className="bg-canvas">
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: "url(/landing/hero-bg.svg)" }}
          aria-hidden
        />
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo tone="light" />
          <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <a href="#problem" className="hover:text-white">Problem</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
          </nav>
          <Link
            href={cta.href}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-brand-50"
          >
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-coral-400" />
              For solo founders and small teams
            </span>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Paste your URL.
              <br />
              Get a week of posts and <span className="text-coral-400">tested</span> Ads.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              SocialCoFounder reads your site, writes a Brief and a Voice you approve, then makes posts, images, Carousels and
              Ads in two Variants for every Platform. You pick the Winner. It schedules the rest.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href={cta.href}
                className="rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40 transition hover:bg-brand-500"
              >
                {cta.label} &rarr;
              </Link>
              <a href="#how" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10">
                See how it works
              </a>
            </div>
            <p className="mt-6 text-sm text-white/50">Nine Platforms. Drafts first. Nothing goes out without your look.</p>
          </div>
          <HeroMock />
        </div>
      </section>

      <section id="problem" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
        <SectionTitle eyebrow="The problem" title="Content is a second job you never hired for." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="font-display text-3xl font-semibold text-brand-600">{p.stat}</div>
              <h3 className="mt-3 font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-zinc-500">{SURVEY_SOURCE}</p>
      </section>

      <section id="how" className="scroll-mt-8 border-y border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionTitle eyebrow="How it works" title="From one link to a scheduled week, in four steps." />
          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl bg-canvas p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
        <SectionTitle eyebrow="Features" title="Everything between your URL and your feed." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={f.icon} />
                  </svg>
                </span>
                {f.soon && <span className="rounded-full bg-coral-400/15 px-2 py-0.5 text-[11px] font-medium text-coral-500">Coming soon</span>}
              </div>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-center text-sm font-medium text-zinc-500">Publishes to nine Platforms</p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {PLATFORMS.map((p) => (
              <li key={p} className="rounded-full border border-zinc-200 bg-canvas px-4 py-1.5 text-sm font-medium text-zinc-700">
                {PLATFORM_RULES[p].name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-8 py-16 text-white sm:px-16">
          <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-80" style={{ backgroundImage: "url(/landing/hero-bg.svg)" }} aria-hidden />
          <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm font-medium text-coral-300">Measured, not claimed</p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight">Give your week back to the product.</h2>
              <p className="mt-4 max-w-lg text-white/70">
                Every Run is timed from the moment you paste your URL to the first Post leaving, so the hours you save show up
                on your dashboard.
              </p>
              <Link
                href={cta.href}
                className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-brand-50"
              >
                {cta.label} &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <BigStat value="1-3 h" label="a week by hand, from the survey" />
              <BigStat value="2" label="Variants for every Platform" />
              <BigStat value="9" label="Platforms from one panel" />
              <BigStat value="0" label="posts sent without your look" />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500">
          <Logo />
          <span>Built at SpeedHacks, SF Tech Week 2026.</span>
          <Link href={cta.href} className="font-medium text-brand-600 hover:text-brand-700">
            {cta.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-4xl font-semibold leading-tight text-ink">{title}</h2>
    </div>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div className="font-display text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs leading-snug text-white/60">{label}</div>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-500/20 blur-2xl" />
      <div className="rounded-3xl border border-white/10 bg-white/95 p-5 text-zinc-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold">Instagram</span>
            <span className="text-xs text-zinc-500">Carousel, 3 images</span>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600">Run time 6 min</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MockVariant label="A" angle="Time saved" color="#2a78d6" tint="from-brand-500 to-brand-700" rate="2.9%" />
          <MockVariant label="B" angle="A/B testing" color="#eb6834" tint="from-coral-400 to-coral-500" rate="4.1%" winner />
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden rounded-2xl border border-white/10 bg-ink/90 px-4 py-3 text-xs text-white shadow-xl backdrop-blur sm:block">
        <div className="text-white/60">Scheduled</div>
        <div className="mt-0.5 font-semibold">Tue 9:00, LinkedIn + X</div>
      </div>
    </div>
  );
}

function MockVariant({
  label,
  angle,
  color,
  tint,
  rate,
  winner = false,
}: {
  label: string;
  angle: string;
  color: string;
  tint: string;
  rate: string;
  winner?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${winner ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-zinc-200"}`}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          Variant {label}
        </span>
        {winner && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">Winner</span>}
      </div>
      <div className={`mt-2 aspect-[4/3] rounded-xl bg-gradient-to-br ${tint}`} />
      <div className="mt-2 space-y-1">
        <div className="h-2 w-11/12 rounded bg-zinc-200" />
        <div className="h-2 w-3/4 rounded bg-zinc-200" />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{angle}</span>
        <span className="font-semibold text-zinc-800">{rate}</span>
      </div>
    </div>
  );
}
