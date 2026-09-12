"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Accounts", match: (p: string) => p === "/" || p.startsWith("/accounts") },
  { href: "/students", label: "Students", match: (p: string) => p.startsWith("/students") },
  { href: "/calendar", label: "Calendar", match: (p: string) => p.startsWith("/calendar") || p.startsWith("/lessons") },
  { href: "/payments", label: "Payments", match: (p: string) => p.startsWith("/payments") },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((it) => {
        const active = it.match(path);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm ${active ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-3"}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-surface md:hidden" aria-label="Main">
      {items.map((it) => {
        const active = it.match(path);
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} className={`py-2.5 text-center text-xs ${active ? "font-semibold text-brand" : "text-muted"}`}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
