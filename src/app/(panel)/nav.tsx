"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" },
  { href: "/company", label: "Company", icon: "M4 20V8l8-4 8 4v12M9 20v-5h6v5" },
  { href: "/content", label: "Content", icon: "M5 5h14v10H8l-3 3z" },
  { href: "/ads", label: "Ads", icon: "M5 5h6v14H5zM13 5h6v14h-6z" },
  { href: "/accounts", label: "Accounts", icon: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  { href: "/analytics", label: "Analytics", icon: "M5 19V9M12 19V5M19 19v-7" },
] as const;

export function PanelNav({ layout }: { layout: "side" | "top" }) {
  const pathname = usePathname();
  return (
    <nav className={layout === "side" ? "flex flex-col gap-1" : "-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]"}>
      {NAV.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg
              className={`h-[18px] w-[18px] ${active ? "text-brand-600" : "text-zinc-400"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={icon} />
            </svg>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
