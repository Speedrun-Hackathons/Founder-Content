import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/company", "Company"],
  ["/content", "Content"],
  ["/ads", "Ads"],
  ["/accounts", "Accounts"],
  ["/analytics", "Analytics"],
] as const;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-zinc-200 bg-white">
        <div className="px-5 py-5 text-lg font-semibold">Founder Content</div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-200 px-5 py-4 text-xs text-zinc-500">
          <div className="truncate">{session.user.email ?? session.user.name}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="mt-2 text-zinc-700 underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
