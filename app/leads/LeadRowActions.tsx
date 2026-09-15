"use client";

import { RowAsk, RowIcons, dangerClass, noClass, useAsk } from "@/src/components/ListRowActions";
import { deleteLeadAction } from "./actions";

/** Edit and delete for one lead line. Moving and enrolling happen on the lead's page. */
export function LeadRowActions({ id, what, canWrite, here }: { id: string; what: string; canWrite: boolean; here: string }) {
  const { asking, ask, close } = useAsk<"delete">();
  const question = asking === "delete" ? (
    <form action={deleteLeadAction}>
      <input type="hidden" name="leadId" value={id} />
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
      editHref={canWrite ? `/leads/${id}?edit=1&returnTo=${here}` : undefined}
      onDelete={canWrite ? () => ask("delete") : undefined}
      ask={question}
    />
  );
}
