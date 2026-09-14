"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { deleteLessonAction } from "@/app/lessons/actions";

/**
 * Move the selection from one chip to another. Up and Down step through events
 * in order, crossing into the next or previous day. Left and Right jump to the
 * neighbouring day that has events, keeping the position in the list.
 */
function moveSelection(from: HTMLElement, key: string) {
  const chips = Array.from(document.querySelectorAll<HTMLElement>("[data-lesson]"));
  const i = chips.indexOf(from);
  if (i < 0) return;
  let target: HTMLElement | undefined;
  if (key === "ArrowDown") target = chips[i + 1];
  else if (key === "ArrowUp") target = chips[i - 1];
  else {
    const days: string[] = [];
    for (const c of chips) if (days[days.length - 1] !== c.dataset.dayOf) days.push(c.dataset.dayOf ?? "");
    const inDay = (d: string) => chips.filter((c) => c.dataset.dayOf === d);
    const here = days.indexOf(from.dataset.dayOf ?? "");
    const pos = inDay(from.dataset.dayOf ?? "").indexOf(from);
    const next = days[here + (key === "ArrowRight" ? 1 : -1)];
    if (next !== undefined) {
      const list = inDay(next);
      target = list[Math.min(pos, list.length - 1)];
    }
  }
  if (target) {
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

/**
 * One lesson or event on the calendar. Click selects it, double-click or Enter
 * opens it, Delete or Backspace asks and then deletes it, arrows move between events.
 */
export function EventChip({ lessonId, day, href, what, inSeries, charged, className, style, title, children }: {
  lessonId: string;
  /** "YYYY-MM-DD", for moving left and right between days. */
  day: string;
  href: string;
  /** "Victoria Li, Sep 14 at 2:45 PM", for the confirmation. */
  what: string;
  inSeries: boolean;
  /** Has a live charge that deleting will take off the account. */
  charged: boolean;
  className: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chip = useRef<HTMLDivElement>(null);

  function remove(scope: "one" | "future") {
    startTransition(async () => {
      const r = await deleteLessonAction(lessonId, scope);
      if (r.error) {
        setError(r.error);
        return;
      }
      setAsking(false);
      router.refresh();
    });
  }

  return (
    <>
      <div
        ref={chip}
        role="button"
        tabIndex={0}
        data-lesson={lessonId}
        data-day-of={day}
        aria-label={what}
        title={title ? `${title}\nDouble-click to open, Delete to remove, arrows to move` : "Double-click to open, Delete to remove, arrows to move"}
        className={`${className} cursor-default select-none outline-none focus:bg-brand-soft focus:ring-2 focus:ring-brand`}
        style={style}
        onClick={(e) => e.currentTarget.focus()}
        onDoubleClick={(e) => {
          e.stopPropagation(); // the day cell behind would otherwise start a new lesson
          router.push(href);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(href);
          else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            setError(null);
            setAsking(true);
          } else if (e.key === "Escape") e.currentTarget.blur();
          else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault(); // no page scroll
            moveSelection(e.currentTarget, e.key);
          }
        }}
      >
        {children}
      </div>
      {asking && (
        <ConfirmDelete
          what={what}
          inSeries={inSeries}
          charged={charged}
          pending={pending}
          error={error}
          onCancel={() => {
            setAsking(false);
            chip.current?.focus();
          }}
          onDelete={remove}
        />
      )}
    </>
  );
}

function ConfirmDelete({ what, inSeries, charged, pending, error, onCancel, onDelete }: {
  what: string;
  inSeries: boolean;
  charged: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: (scope: "one" | "future") => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel} onDoubleClick={(e) => e.stopPropagation()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 id="del-title" className="text-base font-semibold">Delete this?</h2>
        <p className="mt-2 text-sm">{what}</p>
        <p className="mt-1 text-sm text-muted">
          {charged ? "The charge comes off the account. " : ""}It disappears from the calendar. To keep a record that it was missed, cancel it instead.
        </p>
        {error && <p className="mt-2 text-sm text-owed" role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={`${btn} border border-line hover:bg-surface-3`} onClick={onCancel} disabled={pending}>Keep it</button>
          {inSeries && (
            <button type="button" className={`${btn} border border-owed/40 text-owed hover:bg-surface-3`} onClick={() => onDelete("future")} disabled={pending}>This and all later</button>
          )}
          <button ref={first} type="button" className={`${btn} bg-owed text-white hover:opacity-90`} onClick={() => onDelete("one")} disabled={pending}>
            {pending ? "Deleting" : inSeries ? "Delete this one" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
