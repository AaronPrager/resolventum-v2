"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Ban } from "lucide-react";
import { Button, FormError, Input } from "@/src/components/ui";
import { RowAsk, RowIcons, dangerClass, noClass, useAsk } from "@/src/components/ListRowActions";
import { type ActionState, deleteExpenseRowAction, voidExpenseRowAction } from "./actions";

/** Edit, void, open, delete for one expense line. Void and delete ask here first. */
export function ExpenseRowActions({ id, what, voided, canWrite, here }: { id: string; what: string; voided: boolean; canWrite: boolean; here: string }) {
  const router = useRouter();
  const { asking, ask, close } = useAsk<"void" | "delete">();
  const [v, voidAction, voiding] = useActionState(voidExpenseRowAction, {} as ActionState);
  const [d, deleteAction, deleting] = useActionState(deleteExpenseRowAction, {} as ActionState);
  useEffect(() => { if (v.ok || d.ok) { close(); router.refresh(); } }, [v, d, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const question = asking === "void" ? (
    <form action={voidAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="expenseId" value={id} />
      <Input name="reason" placeholder="Reason (optional)" aria-label="Reason" autoFocus className="w-44" />
      <Button type="submit" variant="danger" disabled={voiding}>{voiding ? "Voiding" : "Void it"}</Button>
      <button type="button" onClick={close} className={`text-xs ${noClass}`}>Keep it</button>
      <FormError>{v.error}</FormError>
    </form>
  ) : asking === "delete" ? (
    <form action={deleteAction}>
      <input type="hidden" name="expenseId" value={id} />
      <RowAsk>
        {d.error ? <span className="text-owed">{d.error}</span> : <span>Delete for good?</span>}
        {!d.error && <button type="submit" disabled={deleting} className={dangerClass}>{deleting ? "Deleting" : "Yes"}</button>}
        <button type="button" onClick={close} className={noClass}>{d.error ? "Close" : "No"}</button>
      </RowAsk>
    </form>
  ) : null;

  return (
    <RowIcons
      what={what}
      editHref={canWrite && !voided ? `/expenses/${id}?edit=1&returnTo=${here}` : undefined}
      middle={canWrite && !voided ? { icon: Ban, tip: "Void", onClick: () => ask("void") } : undefined}
      onDelete={canWrite ? () => ask("delete") : undefined}
      ask={question}
    />
  );
}
