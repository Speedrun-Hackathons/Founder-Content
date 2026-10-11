import { auth, signOut } from "@/auth";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelNav } from "./nav";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const who = session.user.email ?? session.user.name ?? "";
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
        <Link href="/" className="px-5 py-5">
          <Logo />
        </Link>
        <div className="flex-1 px-3">
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
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
