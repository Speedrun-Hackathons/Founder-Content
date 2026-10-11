import { auth, credentialsConfigured, signIn } from "@/auth";
import { Logo } from "@/components/logo";
import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const POINTS = [
  "A Brief and a Voice from your Company URL",
  "Two Variants per Platform, and you pick the Winner",
  "Drafts first, then schedule or publish to nine Platforms",
];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-2">
      <section className="relative isolate hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url(/landing/hero-bg.svg)" }} aria-hidden />
        <Link href="/">
          <Logo tone="light" />
        </Link>
        <div>
          <h2 className="max-w-md text-4xl font-semibold leading-tight">Your week of posts and tested Ads, from one link.</h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3 text-white/80">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/50">Built at SpeedHacks, SF Tech Week 2026.</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>
          <h1 className="mt-8 text-3xl font-semibold text-ink lg:mt-0">Welcome back</h1>
          <p className="mt-2 text-sm text-zinc-600">Sign in to your panel to run your Company&apos;s content.</p>
          {credentialsConfigured ? (
            <form
              className="mt-8 flex flex-col gap-4"
              action={async (formData: FormData) => {
                "use server";
                try {
                  await signIn("credentials", {
                    email: String(formData.get("email") ?? ""),
                    password: String(formData.get("password") ?? ""),
                    redirectTo: "/dashboard",
                  });
                } catch (error) {
                  if (error instanceof AuthError) redirect("/signin?error=CredentialsSignin");
                  throw error;
                }
              }}
            >
              <label className="text-sm font-medium text-zinc-800">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 font-normal shadow-sm"
                />
              </label>
              <label className="text-sm font-medium text-zinc-800">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 font-normal shadow-sm"
                />
              </label>
              {error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Sign-in failed: the email or password did not match.
                </p>
              )}
              <button
                type="submit"
                className="mt-2 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500"
              >
                Sign in
              </button>
            </form>
          ) : (
            <p className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Sign-in is not configured on this server: DEMO_EMAIL or DEMO_PASSWORD is empty.
            </p>
          )}
          <Link href="/" className="mt-8 inline-block text-sm text-zinc-500 hover:text-zinc-800">
            &larr; Back to the home page
          </Link>
        </div>
      </section>
    </main>
  );
}
