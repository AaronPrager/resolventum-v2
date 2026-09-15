"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Pencil, Trash2, type LucideIcon } from "lucide-react";

/** The icon buttons at the end of a list row. Same size and colours on every list. */
export const rowIcon = "inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-3 hover:text-fg [&_svg]:size-4";

/** A one-line question that replaces the icons until answered. */
export function RowAsk({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-2 whitespace-nowrap text-xs ${className ?? ""}`}>{children}</span>;
}
export const yesClass = "font-medium text-brand hover:underline";
export const dangerClass = "font-medium text-owed hover:underline";
export const noClass = "text-muted hover:underline";

/**
 * Edit, a middle action (archive, void, cancel), delete, in that order on
 * every list. Clicking the row opens the record, so there is no open icon. `what` names the thing for screen readers ("Zoey Lee").
 * Pass `ask` to show a question instead of the icons; the caller decides what
 * each icon opens.
 */
export function RowIcons({ what, editHref, middle, onDelete, ask }: {
  what: string;
  /** Where the pencil goes. Omitted when the person cannot edit. */
  editHref?: string;
  /** The second icon: its picture, tooltip, and what happens. Omitted when there is none. */
  middle?: { icon: LucideIcon; tip: string; onClick: () => void; danger?: boolean };
  /** The trash can. Omitted when the person cannot delete. */
  onDelete?: () => void;
  ask?: ReactNode;
}) {
  if (ask) return <>{ask}</>;
  const Middle = middle?.icon;
  return (
    <span className="inline-flex items-center gap-0.5">
      {editHref && <Link href={editHref} className={rowIcon} data-tip="Edit" aria-label={`Edit ${what}`}><Pencil aria-hidden /></Link>}
      {middle && Middle && <button type="button" onClick={middle.onClick} className={`${rowIcon} ${middle.danger ? "hover:bg-owed-soft hover:text-owed" : ""}`} data-tip={middle.tip} aria-label={`${middle.tip} ${what}`}><Middle aria-hidden /></button>}
      {onDelete && <button type="button" onClick={onDelete} className={`${rowIcon} hover:bg-owed-soft hover:text-owed`} data-tip="Delete" aria-label={`Delete ${what}`}><Trash2 aria-hidden /></button>}
    </span>
  );
}

/** Keeps which question a row is asking, and closes it. */
export function useAsk<T extends string>() {
  const [asking, setAsking] = useState<T | null>(null);
  return { asking, ask: (t: T) => setAsking(t), close: () => setAsking(null) };
}
