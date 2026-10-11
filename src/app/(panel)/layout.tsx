import { auth, signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { socialStreamline } from "@/lib/social";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelNav } from "./nav";

type Workspace = { email: string; credits: number } | { error: string };

/** The posting-service account the server's key posts as, for the sidebar. Never blocks the page. */
async function workspace(): Promise<Workspace> {
  try {
    const ss = socialStreamline();
    const [me, credits] = await Promise.all([ss.me(), ss.credits()]);
    return { email: me.email, credits: credits.available };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const who = session.user.email ?? session.user.name ?? "";
  const linked = await workspace();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
        <Link href="/" className="px-5 py-5">
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto px-3">
          <PanelNav layout="side" />
        </div>
        <div className="m-3 rounded-2xl bg-canvas p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold uppercase text-white">
              {who.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-800">{session.user.name ?? "Founder"}</div>
              <div className="truncate text-xs text-zinc-500">{session.user.email}</div>
            </div>
          </div>
          <div className="mt-3 border-t border-zinc-200 pt-2 text-xs">
            {"error" in linked ? (
              <span className="text-amber-700" title={linked.error}>
                Social Streamline not connected
              </span>
            ) : (
              <>
                <div className="truncate text-zinc-500" title={linked.email}>
                  Posting as {linked.email}
                </div>
                <div className="mt-0.5 font-medium text-zinc-800">{linked.credits.toLocaleString("en-US")} credits</div>
              </>
            )}
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 pb-2 pt-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="text-xs font-medium text-zinc-600">
              Sign out
            </button>
          </form>
        </div>
        <div className="mt-3">
          <PanelNav layout="top" />
        </div>
      </header>
      <main className="relative isolate min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_15%_0%,var(--color-brand-100),transparent),radial-gradient(40%_80%_at_90%_0%,color-mix(in_oklab,var(--color-coral-300)_45%,transparent),transparent)]"
          aria-hidden
        />
        {children}
      </main>
    </div>
  );
}
