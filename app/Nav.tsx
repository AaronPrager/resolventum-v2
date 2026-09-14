"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, BookOpenCheck, CalendarDays, CreditCard, Ellipsis, GraduationCap, HandCoins, Home, Mail, Receipt, Settings, UserPlus, Wallet, X, type LucideIcon,
} from "lucide-react";

interface Item { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }

const home: Item = { href: "/", label: "Home", icon: Home, match: (p) => p === "/" };
const calendar: Item = { href: "/calendar", label: "Calendar", icon: CalendarDays, match: (p) => p.startsWith("/calendar") || p.startsWith("/lessons") };
const students: Item = { href: "/students", label: "Students", icon: GraduationCap, match: (p) => p.startsWith("/students") };
const homework: Item = { href: "/homework", label: "Homework", icon: BookOpenCheck, match: (p) => p.startsWith("/homework") || p.startsWith("/library") };
const emails: Item = { href: "/emails", label: "Emails", icon: Mail, match: (p) => p.startsWith("/emails") };
const leads: Item = { href: "/leads", label: "Leads", icon: UserPlus, match: (p) => p.startsWith("/leads") };
const accounts: Item = { href: "/accounts", label: "Accounts", icon: Wallet, match: (p) => p.startsWith("/accounts") };
const payments: Item = { href: "/payments", label: "Payments", icon: CreditCard, match: (p) => p.startsWith("/payments") };
const expenses: Item = { href: "/expenses", label: "Expenses", icon: Receipt, match: (p) => p.startsWith("/expenses") };
const reports: Item = { href: "/reports", label: "Reports", icon: BarChart3, match: (p) => p.startsWith("/reports") };
const earnings: Item = { href: "/earnings", label: "My pay", icon: HandCoins, match: (p) => p.startsWith("/earnings") };
const settings: Item = { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") };

/** What each role gets. A tutor sees their own calendar, students, homework, and pay; no money pages. */
function menus(role: string) {
  if (role === "TUTOR") return { teach: [calendar, students, homework, emails], money: [earnings], bar: [calendar, students, homework, earnings], more: [emails, settings] };
  return { teach: [home, calendar, students, leads, homework, emails], money: [accounts, payments, expenses, reports], bar: [home, calendar, students, accounts], more: [leads, homework, emails, payments, expenses, reports, settings] };
}

function NavLink({ it, active }: { it: Item; active: boolean }) {
  const Icon = it.icon;
  return (
    <Link
      href={it.href}
      aria-current={active ? "page" : undefined}
      className={`group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
        active ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3/70 hover:text-fg"
      }`}
    >
      <Icon className={`size-[18px] shrink-0 ${active ? "text-brand" : "text-faint group-hover:text-muted"}`} strokeWidth={1.75} aria-hidden />
      {it.label}
    </Link>
  );
}

export function SideNav({ role }: { role: string }) {
  const path = usePathname();
  const { teach, money } = menus(role);
  return (
    <nav className="flex flex-1 flex-col gap-5" aria-label="Main">
      <div className="flex flex-col gap-0.5">{teach.map((it) => <NavLink key={it.href} it={it} active={it.match(path)} />)}</div>
      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Money</div>
        {money.map((it) => <NavLink key={it.href} it={it} active={it.match(path)} />)}
      </div>
      <div className="mt-auto flex flex-col gap-0.5"><NavLink it={settings} active={settings.match(path)} /></div>
    </nav>
  );
}

export function BottomNav({ role }: { role: string }) {
  const path = usePathname();
  const { bar, more } = menus(role);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const moreActive = more.some((it) => it.match(path));
  const cell = "flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px]";
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-3 bottom-[4.5rem] rounded-2xl border border-line bg-surface p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
            {more.map((it) => {
              const Icon = it.icon;
              const active = it.match(path);
              return (
                <Link key={it.href} href={it.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] ${active ? "bg-brand-soft font-medium text-brand" : "text-fg"}`}>
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
        {bar.map((it) => {
          const Icon = it.icon;
          const active = it.match(path);
          return (
            <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} className={`${cell} ${active ? "font-medium text-brand" : "text-muted"}`}>
              <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.75} aria-hidden />
              {it.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${cell} ${moreActive || open ? "font-medium text-brand" : "text-muted"}`}>
          {open ? <X className="size-[22px]" strokeWidth={1.75} aria-hidden /> : <Ellipsis className="size-[22px]" strokeWidth={1.75} aria-hidden />}
          More
        </button>
      </nav>
    </>
  );
}
