"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "./Logo";
import { SideNav } from "./Nav";
import { Avatar } from "@/src/components/ui";
import { SIDEBAR_COOKIE } from "@/src/auth/constants";

/**
 * The left menu on a desktop. It folds to an icon rail and back; the choice
 * is kept in a cookie so the next page renders folded from the server and
 * nothing jumps. Everything stays reachable: folded items carry their name as
 * a tooltip and for screen readers.
 */
export function Sidebar({ initialCollapsed, role, organizationName, who, dev, logout }: {
  initialCollapsed: boolean;
  role: string;
  organizationName: string;
  who: string;
  dev: boolean;
  logout: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  const label = collapsed ? "Expand the menu" : "Collapse the menu";
  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={`hidden shrink-0 border-r border-line bg-surface-2 transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-screen md:flex-col ${collapsed ? "w-16" : "w-60"}`}
    >
      <div className={collapsed ? "flex flex-col items-center gap-2 px-2 pb-3 pt-4" : "px-4 pb-4 pt-4"}>
        <Link href="/" className="rounded-lg" title={collapsed ? "Home" : undefined}><Logo compact={collapsed} /></Link>
        {!collapsed && (
          <div className="mt-3 truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium shadow-xs" title={organizationName}>{organizationName}</div>
        )}
      </div>
      <div className={`flex flex-1 flex-col overflow-y-auto pb-3 ${collapsed ? "px-2" : "px-3"}`}><SideNav role={role} collapsed={collapsed} /></div>
      <div className={`border-t border-line ${collapsed ? "flex flex-col items-center gap-1 px-2 py-3" : "flex items-center gap-2.5 px-4 py-3"}`}>
        <span title={collapsed ? `${who} · ${role.toLowerCase()}` : undefined}><Avatar name={who} /></span>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{who}</div>
            <div className="truncate text-xs text-muted">{role.toLowerCase()}{dev && <span className="ml-1.5 rounded bg-warn-soft px-1 py-px text-[10px] font-medium text-warn" title="Signed in automatically because DEV_AUTO_LOGIN is set">dev</span>}</div>
          </div>
        )}
        <form action={logout}>
          <IconButton label="Sign out"><LogOut className="size-4" aria-hidden /></IconButton>
        </form>
      </div>
      <div className={`border-t border-line ${collapsed ? "flex justify-center px-2 py-2" : "flex justify-end px-3 py-2"}`}>
        <IconButton label={label} onClick={toggle} pressed={collapsed} testId="sidebar-toggle">
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
        </IconButton>
      </div>
    </aside>
  );
}

function IconButton({ label, onClick, pressed, testId, children }: { label: string; onClick?: () => void; pressed?: boolean; testId?: string; children: ReactNode }) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={onClick ? pressed : undefined}
      data-testid={testId}
      className="inline-flex size-8 items-center justify-center rounded-lg text-faint hover:bg-surface-3 hover:text-fg"
    >
      {children}
    </button>
  );
}
