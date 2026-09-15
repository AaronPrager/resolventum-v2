"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, BookOpenCheck, Building2, CalendarDays, ChevronDown, CreditCard, Ellipsis, FileSignature, FolderOpen, GraduationCap, HandCoins, History, Home, Mail, NotebookPen, Receipt, UserPlus, Users, Wallet, X, type LucideIcon,
} from "lucide-react";

interface Item { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean; children?: Item[] }

const home: Item = { href: "/", label: "Home", icon: Home, match: (p) => p === "/" };
const calendar: Item = { href: "/calendar", label: "Calendar", icon: CalendarDays, match: (p) => p.startsWith("/calendar") || p.startsWith("/lessons") };
const students: Item = { href: "/students", label: "Students", icon: GraduationCap, match: (p) => p.startsWith("/students") };
const notes: Item = { href: "/notes", label: "Session notes", icon: NotebookPen, match: (p) => p.startsWith("/notes") };
const homework: Item = { href: "/homework", label: "Assignments", icon: BookOpenCheck, match: (p) => p.startsWith("/homework") };
const library: Item = { href: "/library", label: "Library", icon: FolderOpen, match: (p) => p.startsWith("/library") };
/** What a tutor produces between lessons: the note for the family, the homework, and the files behind it. One group, so they sit together. */
const teaching: Item = { href: "/notes", label: "Teaching", icon: BookOpenCheck, match: (p) => p.startsWith("/notes") || p.startsWith("/homework") || p.startsWith("/library"), children: [notes, homework, library] };
const emails: Item = { href: "/emails", label: "Emails", icon: Mail, match: (p) => p.startsWith("/emails") };
const leads: Item = { href: "/leads", label: "Leads", icon: UserPlus, match: (p) => p.startsWith("/leads") };
const accounts: Item = { href: "/accounts", label: "Accounts", icon: Wallet, match: (p) => p.startsWith("/accounts") };
const payments: Item = { href: "/payments", label: "Payments", icon: CreditCard, match: (p) => p.startsWith("/payments") };
const expenses: Item = { href: "/expenses", label: "Expenses", icon: Receipt, match: (p) => p.startsWith("/expenses") };
const reports: Item = { href: "/reports", label: "Reports", icon: BarChart3, match: (p) => p.startsWith("/reports") };
const earnings: Item = { href: "/earnings", label: "My pay", icon: HandCoins, match: (p) => p.startsWith("/earnings") };
const officeTutors: Item = { href: "/settings/tutors", label: "Tutors", icon: GraduationCap, match: (p) => p.startsWith("/settings/tutors") };
const officeTeam: Item = { href: "/settings/team", label: "Team", icon: Users, match: (p) => p.startsWith("/settings/team") };
const officeAgreement: Item = { href: "/settings/agreement", label: "Agreement", icon: FileSignature, match: (p) => p.startsWith("/settings/agreement") };
const officeAudit: Item = { href: "/settings/audit", label: "Audit", icon: History, match: (p) => p.startsWith("/settings/audit") };
/** The school's settings, with its four sub-pages listed underneath in the sidebar. */
const office: Item = { href: "/settings", label: "Office", icon: Building2, match: (p) => p.startsWith("/settings"), children: [officeTutors, officeTeam, officeAgreement, officeAudit] };

/** The money pages as one group, like Teaching and Office. */
const money: Item = { href: "/accounts", label: "Money", icon: Wallet, match: (p) => p.startsWith("/accounts") || p.startsWith("/payments") || p.startsWith("/expenses") || p.startsWith("/reports"), children: [accounts, payments, expenses, reports] };

/**
 * One list per role, top to bottom, with three groups that fold the same way.
 * A tutor sees their own calendar, students, teaching, and pay; no money and
 * no office. The profile opens from the person's name.
 */
function menus(role: string) {
  if (role === "TUTOR") return { items: [calendar, students, teaching, emails, earnings], bar: [calendar, students, notes, earnings], more: [homework, library, emails] };
  return { items: [home, calendar, students, leads, teaching, emails, money, office], bar: [home, calendar, students, accounts], more: [leads, notes, homework, library, emails, payments, expenses, reports, office, ...office.children!] };
}

function NavLink({ it, active, collapsed, sub }: { it: Item; active: boolean; collapsed?: boolean; sub?: boolean }) {
  const Icon = it.icon;
  return (
    <Link
      href={it.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? it.label : undefined}
      title={collapsed ? it.label : undefined}
      className={`group flex h-8 items-center gap-2.5 rounded-lg text-sm transition-colors ${collapsed ? "justify-center px-0" : sub ? "ml-5 px-2.5" : "px-2.5"} ${
        active ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3/70 hover:text-fg"
      }`}
    >
      <Icon className={`${sub ? "size-4" : "size-[18px]"} shrink-0 ${active ? "text-brand" : "text-faint group-hover:text-muted"}`} strokeWidth={1.75} aria-hidden />
      {!collapsed && it.label}
    </Link>
  );
}

/** Which groups the person closed, kept in the browser. Opening a page inside a group opens it again. */
function readClosed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem("nav-closed") ?? "{}"); } catch { return {}; }
}
function writeClosed(v: Record<string, boolean>) {
  try { localStorage.setItem("nav-closed", JSON.stringify(v)); } catch { /* private window, or storage off: the choice lasts the page */ }
}

/**
 * A menu entry and, when it has children, those entries indented under it.
 * The name goes to the page; the chevron folds the entries away. The fold is
 * remembered per group, and a group opens itself when you are inside it.
 * With the whole sidebar folded to icons, only the parent shows.
 */
function NavGroup({ it, path, collapsed }: { it: Item; path: string; collapsed?: boolean }) {
  const childActive = it.children?.some((c) => c.match(path)) ?? false;
  const [closed, setClosed] = useState(false);
  useEffect(() => { setClosed(!!readClosed()[it.href]); }, [it.href]);
  useEffect(() => { if (childActive) setClosed(false); }, [childActive, path]);
  if (!it.children) return <NavLink it={it} active={it.match(path)} collapsed={collapsed} />;
  const open = !closed;
  function toggle() {
    const next = !closed;
    setClosed(next);
    writeClosed({ ...readClosed(), [it.href]: next });
  }
  return (
    <>
      <div className="relative">
        <NavLink it={it} active={it.match(path) && !childActive} collapsed={collapsed} />
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Fold" : "Unfold"} ${it.label}`}
            title={open ? "Fold" : "Unfold"}
            className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-surface-3 hover:text-fg"
          >
            <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      {!collapsed && open && it.children.map((c) => <NavLink key={c.href} it={c} active={c.match(path)} sub />)}
    </>
  );
}

/** The desktop menu. Folded, it is icons only with the name as a tooltip; the Money heading becomes a rule. */
export function SideNav({ role, collapsed }: { role: string; collapsed?: boolean }) {
  const path = usePathname();
  const { items } = menus(role);
  return (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
      {items.map((it) => <NavGroup key={it.href} it={it} path={path} collapsed={collapsed} />)}
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
