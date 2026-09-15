"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Archive, ArchiveRestore, Info, Pencil, Trash2 } from "lucide-react";
import { type ActionState, deleteStudentAction, setStudentStateAction } from "./actions";

const icon = "inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-3 hover:text-fg [&_svg]:size-4";

/**
 * The small icons at the end of a student's row: edit, archive or bring
 * back, open, delete. The two that change something ask inline first, so
 * they work where a browser dialog would not.
 */
export function RowActions({ id, first, archived, listHref }: { id: string; first: string; archived: boolean; listHref: string }) {
  const [asking, setAsking] = useState<"archive" | "delete" | null>(null);
  const [del, deleteAction, deleting] = useActionState(deleteStudentAction, {} as ActionState);
  if (asking === "archive") {
    return (
      <form action={setStudentStateAction} className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
        <input type="hidden" name="studentId" value={id} /><input type="hidden" name="state" value={archived ? "ACTIVE" : "ARCHIVED"} /><input type="hidden" name="returnTo" value={listHref} />
        <span>{archived ? `Bring ${first} back?` : `Archive ${first}?`}</span>
        <button type="submit" className="font-medium text-brand hover:underline">Yes</button>
        <button type="button" onClick={() => setAsking(null)} className="text-muted hover:underline">No</button>
      </form>
    );
  }
  if (asking === "delete") {
    return (
      <form action={deleteAction} className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
        <input type="hidden" name="studentId" value={id} /><input type="hidden" name="returnTo" value={listHref} />
        {del.error ? <span className="text-owed">{del.error}</span> : <span>Delete {first} for good?</span>}
        {!del.error && <button type="submit" disabled={deleting} className="font-medium text-owed hover:underline">{deleting ? "Deleting" : "Yes"}</button>}
        <button type="button" onClick={() => setAsking(null)} className="text-muted hover:underline">{del.error ? "Close" : "No"}</button>
      </form>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <Link href={`/students/${id}/edit`} className={icon} title="Edit" aria-label={`Edit ${first}`}><Pencil aria-hidden /></Link>
      <button type="button" onClick={() => setAsking("archive")} className={icon} title={archived ? "Bring back" : "Archive"} aria-label={`${archived ? "Bring back" : "Archive"} ${first}`}>{archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}</button>
      <Link href={`/students/${id}`} className={icon} title="More" aria-label={`Open ${first}`}><Info aria-hidden /></Link>
      <button type="button" onClick={() => setAsking("delete")} className={`${icon} hover:bg-owed-soft hover:text-owed`} title="Delete" aria-label={`Delete ${first}`}><Trash2 aria-hidden /></button>
    </span>
  );
}
