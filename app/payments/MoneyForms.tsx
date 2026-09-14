"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input, Select } from "@/src/components/ui";
import type { ActionState } from "./actions";
import { recordAdjustmentAction, recordPaymentAction, updatePaymentAction } from "./actions";

const METHODS: [string, string][] = [["ZELLE", "Zelle"], ["VENMO", "Venmo"], ["CASH", "Cash"], ["CHECK", "Check"], ["CARD", "Card"], ["BANK_TRANSFER", "Bank transfer"], ["OTHER", "Other"]];

export function PaymentForm({ accountId, today }: { accountId: string; today: string }) {
  const [state, action, pending] = useActionState(recordPaymentAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="payment-form">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <Select name="kind" defaultValue="PAYMENT"><option value="PAYMENT">Payment received</option><option value="REFUND">Refund given</option></Select>
        </Field>
        <Field label="Amount"><Input type="text" inputMode="decimal" name="amount" required placeholder="130.00" /></Field>
        <Field label="Date"><Input type="date" name="paidOn" defaultValue={today} required /></Field>
        <Field label="How"><Select name="method" defaultValue="ZELLE">{METHODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
        <Field label="Reference"><Input type="text" name="reference" placeholder="check number, memo" /></Field>
        <Field label="Notes, or reason for a refund"><Input type="text" name="notes" /></Field>
      </div>
      <FormError>{state.error}</FormError>
      <FormOk>{state.ok}</FormOk>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : "Record"}</Button>
    </form>
  );
}

export function AdjustmentForm({ accountId, today, students }: { accountId: string; today: string; students: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(recordAdjustmentAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="adjustment-form">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <Select name="kind" defaultValue="CREDIT"><option value="CREDIT">Credit to the family</option><option value="FEE">Fee</option><option value="TIP">Tip they left</option></Select>
        </Field>
        <Field label="Amount"><Input type="text" inputMode="decimal" name="amount" required placeholder="50.00" /></Field>
        <Field label="Date"><Input type="date" name="chargedOn" defaultValue={today} required /></Field>
        {students.length > 1 ? (
          <Field label="Student"><Select name="studentId" defaultValue=""><option value="">Whole account</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        ) : <div />}
        <Field label="Description" className="col-span-2"><Input type="text" name="description" required /></Field>
      </div>
      <FormError>{state.error}</FormError>
      <FormOk>{state.ok}</FormOk>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Record"}</Button>
    </form>
  );
}

export function PaymentEditForm({ payment, returnTo }: { payment: { id: string; refund: boolean; amount: string; paidOn: string; method: string; reference: string; notes: string; refundReason: string }; returnTo: string }) {
  const [state, action, pending] = useActionState(updatePaymentAction, {} as ActionState);
  return (
    <form action={action} className="space-y-4" data-testid="payment-edit-form">
      <input type="hidden" name="paymentId" value={payment.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={payment.refund ? "Refund amount" : "Amount"}><Input type="text" inputMode="decimal" name="amount" defaultValue={payment.amount} required /></Field>
        <Field label="Date"><Input type="date" name="paidOn" defaultValue={payment.paidOn} required /></Field>
        <Field label="How"><Select name="method" defaultValue={payment.method}>{METHODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
        <Field label="Reference"><Input type="text" name="reference" defaultValue={payment.reference} /></Field>
        {payment.refund && <Field label="Reason for the refund" className="col-span-2"><Input type="text" name="refundReason" defaultValue={payment.refundReason} required /></Field>}
        <Field label="Notes" className={payment.refund ? "col-span-2" : "col-span-full"}><Input type="text" name="notes" defaultValue={payment.notes} /></Field>
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save changes"}</Button>
    </form>
  );
}
