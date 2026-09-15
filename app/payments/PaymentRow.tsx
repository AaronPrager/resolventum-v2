"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Ban, Pencil, Trash2, X } from "lucide-react";
import { Badge, Button, FormError, IconButton, Input, Money, Td } from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { type ActionState, deletePaymentRowAction, voidPaymentRowAction } from "./actions";

/** Same icons and size as the students list. */
const icon = "inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-3 hover:text-fg [&_svg]:size-4";

export interface PaymentRowData {
  id: string;
  accountId: string;
  accountName: string;
  paidOn: string;
  paidOnDate: Date;
  refund: boolean;
  amountCents: number;
  method: string;
  reference: string;
  notes: string;
  refundReason: string;
  voided: boolean;
  voidReason: string;
  reported: boolean;
}

/**
 * One line of the payments list. The pencil opens the payment's own page to
 * edit it. Void keeps the line, struck through, for a payment that was real
 * but is reversed; Delete removes a mistaken entry for good. Both ask here
 * first. Tax-reported lines cannot be changed or deleted.
 */
export function PaymentRow({ p, canWrite, here }: { p: PaymentRowData; canWrite: boolean; here: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "void" | "delete">("view");
  const [voidState, voidAction, voiding] = useActionState(voidPaymentRowAction, {} as ActionState);
  const [del, deleteAction, deleting] = useActionState(deletePaymentRowAction, {} as ActionState);
  // The action result is a new object each time, so a second void on the page closes its row too.
  useEffect(() => {
    if (voidState.ok || del.ok) { setMode("view"); router.refresh(); }
  }, [voidState, del, router]);
  const locked = p.voided || p.reported;
  const dim = p.voided ? "text-muted line-through" : "";

  return (
    <tr data-href={`/payments/${p.id}?returnTo=${here}`} className={`hover:bg-surface-2 ${dim}`} data-testid="payment-row">
      <Td num><Link href={`/payments/${p.id}?returnTo=${here}`} className="underline-offset-2 hover:text-brand hover:underline">{formatDate(p.paidOnDate)}</Link></Td>
      <Td><Link href={`/accounts/${p.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{p.accountName}</Link></Td>
      <Td className="hidden sm:table-cell">{p.method.toLowerCase().replace("_", " ")}{p.reference && <span className="text-muted"> · {p.reference}</span>}</Td>
      <Td className="hidden text-muted md:table-cell">
        {p.refund ? `Refund: ${p.refundReason}` : p.notes}
        {p.voided && <span className="ml-2 inline-flex items-center gap-1 no-underline"><Badge tone="owed">voided</Badge>{p.voidReason && p.voidReason !== "Voided" && <span className="text-xs">{p.voidReason}</span>}</span>}
        {p.reported && <span className="ml-2 no-underline"><Badge tone="warn">reported</Badge></span>}
      </Td>
      <Td right num><Money cents={p.amountCents} signed /></Td>
      <Td right className="whitespace-nowrap">
        {mode === "delete" && (
          <form action={deleteAction} className="inline-flex items-center gap-2 text-xs no-underline" data-testid="delete-form">
            <input type="hidden" name="paymentId" value={p.id} />
            {del.error ? <span className="text-owed">{del.error}</span> : <span className="text-fg">Delete this {p.refund ? "refund" : "payment"} for good?</span>}
            {!del.error && <button type="submit" disabled={deleting} className="font-medium text-owed hover:underline">{deleting ? "Deleting" : "Yes"}</button>}
            <button type="button" onClick={() => setMode("view")} className="text-muted hover:underline">{del.error ? "Close" : "No"}</button>
          </form>
        )}
        {mode === "void" && (
          <form action={voidAction} className="inline-flex items-center gap-2 no-underline" data-testid="void-form">
            <input type="hidden" name="paymentId" value={p.id} />
            <Input name="reason" placeholder="Reason (optional)" aria-label="Reason" autoFocus className="w-44" />
            <Button type="submit" variant="danger" disabled={voiding}>{voiding ? "Voiding" : "Void it"}</Button>
            <IconButton label="Keep it" onClick={() => setMode("view")}><X /></IconButton>
            <FormError>{voidState.error}</FormError>
          </form>
        )}
        {mode === "view" && (
          <span className="inline-flex items-center gap-0.5 no-underline">
            {canWrite && !locked && <Link href={`/payments/${p.id}?edit=1&returnTo=${here}`} className={icon} data-tip="Edit" aria-label={`Edit ${p.accountName}`}><Pencil aria-hidden /></Link>}
            {canWrite && !locked && <button type="button" onClick={() => setMode("void")} className={icon} data-tip="Void" aria-label={`Void ${p.accountName}`}><Ban aria-hidden /></button>}
            {canWrite && !p.reported && <button type="button" onClick={() => setMode("delete")} className={`${icon} hover:bg-owed-soft hover:text-owed`} data-tip="Delete" aria-label={`Delete ${p.accountName}`}><Trash2 aria-hidden /></button>}
          </span>
        )}
      </Td>
    </tr>
  );
}
