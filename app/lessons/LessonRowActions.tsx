"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Pencil, Trash2 } from "lucide-react";
import { cancelLessonAction, deleteLessonAction } from "./actions";

/** Same icons and size as the students and payments lists. */
const icon = "inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-3 hover:text-fg [&_svg]:size-4";

/**
 * The icons at the end of a lesson's row: edit, cancel, delete. Cancel
 * and delete ask here first. Cancel follows the school's policy for the
 * charge; the lesson page has the other choices and the series options.
 */
export function LessonRowActions({ id, what, studentId, inSeries, cancelled, canWrite, here }: {
  id: string;
  /** "Math, Sep 15" for the questions. */
  what: string;
  studentId: string;
  inSeries: boolean;
  cancelled: boolean;
  canWrite: boolean;
  /** The list URL, already encoded, to come back to. */
  here: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove(scope: "one" | "future") {
    start(async () => {
      const r = await deleteLessonAction(id, scope);
      if (r.error) { setError(r.error); return; }
      setAsking(null);
      router.refresh();
    });
  }

  if (asking === "cancel") {
    return (
      <form action={cancelLessonAction} className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
        <input type="hidden" name="lessonId" value={id} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="chargeMode" value="policy" /><input type="hidden" name="returnTo" value={decodeURIComponent(here)} />
        <span title="The charge follows the policy">Cancel it?</span>
        <button type="submit" className="font-medium text-brand hover:underline">Yes</button>
        <button type="button" onClick={() => setAsking(null)} className="text-muted hover:underline">No</button>
      </form>
    );
  }
  if (asking === "delete") {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
        {error ? <span className="text-owed">{error}</span> : <span>Delete for good?</span>}
        {!error && <button type="button" disabled={pending} onClick={() => remove("one")} className="font-medium text-owed hover:underline">{pending ? "Deleting" : inSeries ? "This one" : "Yes"}</button>}
        {!error && inSeries && <button type="button" disabled={pending} onClick={() => remove("future")} className="font-medium text-owed hover:underline">This and later</button>}
        <button type="button" onClick={() => { setAsking(null); setError(null); }} className="text-muted hover:underline">{error ? "Close" : "No"}</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {canWrite && <Link href={`/lessons/${id}?edit=1&returnTo=${here}`} className={icon} data-tip="Edit" aria-label={`Edit ${what}`}><Pencil aria-hidden /></Link>}
      {canWrite && !cancelled && <button type="button" onClick={() => setAsking("cancel")} className={icon} data-tip="Cancel" aria-label={`Cancel ${what}`}><Ban aria-hidden /></button>}
      {canWrite && <button type="button" onClick={() => setAsking("delete")} className={`${icon} hover:bg-owed-soft hover:text-owed`} data-tip="Delete" aria-label={`Delete ${what}`}><Trash2 aria-hidden /></button>}
    </span>
  );
}
