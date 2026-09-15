"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { RowAsk, RowIcons, dangerClass, noClass, useAsk, yesClass } from "@/src/components/ListRowActions";
import { deleteAssignmentAction, toggleArchiveAction } from "./actions";

/** Edit, archive or bring back, delete for one assignment line. Delete only when nothing was handed in. */
export function AssignmentRowActions({ id, what, archived, canDelete, canWrite, here }: { id: string; what: string; archived: boolean; canDelete: boolean; canWrite: boolean; here: string }) {
  const { asking, ask, close } = useAsk<"archive" | "delete">();
  const question = asking === "archive" ? (
    <form action={toggleArchiveAction}>
      <input type="hidden" name="assignmentId" value={id} /><input type="hidden" name="archived" value={archived ? "1" : "0"} />
      <RowAsk>
        <span>{archived ? "Bring it back?" : "Archive it?"}</span>
        <button type="submit" className={yesClass}>Yes</button>
        <button type="button" onClick={close} className={noClass}>No</button>
      </RowAsk>
    </form>
  ) : asking === "delete" ? (
    <form action={deleteAssignmentAction}>
      <input type="hidden" name="assignmentId" value={id} /><input type="hidden" name="returnTo" value={decodeURIComponent(here)} />
      <RowAsk>
        <span>Delete for good?</span>
        <button type="submit" className={dangerClass}>Yes</button>
        <button type="button" onClick={close} className={noClass}>No</button>
      </RowAsk>
    </form>
  ) : null;
  return (
    <RowIcons
      what={what}
      editHref={canWrite ? `/homework/${id}?edit=1&returnTo=${here}` : undefined}
      middle={canWrite ? { icon: archived ? ArchiveRestore : Archive, tip: archived ? "Bring back" : "Archive", onClick: () => ask("archive") } : undefined}
      onDelete={canWrite && canDelete ? () => ask("delete") : undefined}
      ask={question}
    />
  );
}
