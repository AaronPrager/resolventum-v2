"use client";

import { setStudentStateAction } from "./actions";

export type State = "ACTIVE" | "PAUSED" | "ARCHIVED";
const LABEL: Record<State, string> = { ACTIVE: "Active", PAUSED: "Paused", ARCHIVED: "Archived" };

/**
 * The one control for a student's standing. Three pills; the current one is
 * lit. Picking another asks first when lessons would be cancelled, then saves.
 */
export function StatusSwitch({ studentId, state, first, scheduled, returnTo }: { studentId: string; state: State; first: string; scheduled: number; returnTo: string }) {
  const stops = scheduled > 0 ? ` ${scheduled} scheduled lesson${scheduled === 1 ? "" : "s"} will be cancelled and any weekly series stops.` : "";
  const message: Record<State, string> = {
    ACTIVE: "",
    PAUSED: `Pause ${first}?${stops} They stay on the list and out of the lesson pickers until made active again.`,
    ARCHIVED: `Archive ${first}?${stops} Past lessons, payments, and the balance stay. Find them again under Archived.`,
  };
  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Student status" data-testid="status-switch">
      {(Object.keys(LABEL) as State[]).map((s) =>
        s === state ? (
          <span key={s} aria-current="true" className="inline-flex h-8 items-center rounded-md bg-surface px-3 text-sm font-medium text-fg shadow-xs">{LABEL[s]}</span>
        ) : (
          <form key={s} action={setStudentStateAction} onSubmit={(e) => { if (message[s] && !window.confirm(message[s])) e.preventDefault(); }}>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="state" value={s} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted hover:text-fg">{LABEL[s]}</button>
          </form>
        ),
      )}
    </div>
  );
}
