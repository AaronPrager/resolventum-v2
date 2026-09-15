"use client";

import { useEffect, useRef } from "react";

/** The "Delete this?" dialog. Used by the calendar chips and the lesson page. */
export function ConfirmDelete({ what, inSeries, charged, pending, error, onCancel, onDelete }: {
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
