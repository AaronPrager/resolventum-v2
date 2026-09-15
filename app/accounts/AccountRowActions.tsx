"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { RowAsk, RowIcons, noClass, useAsk, yesClass } from "@/src/components/ListRowActions";
import { setAccountArchivedAction } from "./actions";

/** Edit, archive or bring back, open. No delete: an account holds money records. */
export function AccountRowActions({ id, what, archived, canWrite, listHref }: { id: string; what: string; archived: boolean; canWrite: boolean; listHref: string }) {
  const { asking, ask, close } = useAsk<"archive">();
  const question = asking === "archive" ? (
    <form action={setAccountArchivedAction}>
      <input type="hidden" name="accountId" value={id} /><input type="hidden" name="archived" value={archived ? "0" : "1"} /><input type="hidden" name="returnTo" value={listHref} />
      <RowAsk>
        <span>{archived ? "Bring it back?" : "Archive it?"}</span>
        <button type="submit" className={yesClass}>Yes</button>
        <button type="button" onClick={close} className={noClass}>No</button>
      </RowAsk>
    </form>
  ) : null;
  return (
    <RowIcons
      what={what}
      editHref={canWrite ? `/accounts/${id}#family` : undefined}
      middle={canWrite ? { icon: archived ? ArchiveRestore : Archive, tip: archived ? "Bring back" : "Archive", onClick: () => ask("archive") } : undefined}
      ask={question}
    />
  );
}
