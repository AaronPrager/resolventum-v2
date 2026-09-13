"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, FormOk, Input, Select, Textarea } from "@/src/components/ui";
import { type ActionState, createExpenseAction, updateExpenseAction } from "./actions";

export interface ExpenseFormValues {
  spentOn: string; description: string; vendor: string; amount: string; categoryId: string; taxTreatment: string; businessPercent: string; paymentSourceId: string; notes: string;
}
export interface Option { id: string; name: string }

export function ExpenseForm({ mode, expenseId, draftId, initial, categories, vendors, sources, submitLabel }: {
  mode: "create" | "update"; expenseId?: string; draftId?: string; initial: ExpenseFormValues; categories: (Option & { treatment: string })[]; vendors: (Option & { categoryId: string | null; treatment: string | null; percent: number | null })[]; sources: Option[]; submitLabel: string;
}) {
  const [state, action, pending] = useActionState(mode === "create" ? createExpenseAction : updateExpenseAction, {} as ActionState);
  const [treatment, setTreatment] = useState(initial.taxTreatment);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [percent, setPercent] = useState(initial.businessPercent);
  function onVendor(name: string) {
    const v = vendors.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (!v) return;
    if (v.categoryId) setCategoryId(v.categoryId);
    if (v.treatment) setTreatment(v.treatment);
    if (v.percent != null) setPercent(String(v.percent));
  }
  function onCategory(id: string) {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c) setTreatment(c.treatment);
  }
  return (
    <form action={action} className="space-y-3" data-testid="expense-form" key={draftId ?? "form"}>
      {expenseId && <input type="hidden" name="expenseId" value={expenseId} />}
      {draftId && <input type="hidden" name="draftId" value={draftId} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date"><Input type="date" name="spentOn" defaultValue={initial.spentOn} required /></Field>
        <Field label="Amount"><Input type="text" inputMode="decimal" name="amount" defaultValue={initial.amount} required placeholder="18.49" /></Field>
        <Field label="Vendor" className="col-span-2"><Input name="vendor" list="vendors" defaultValue={initial.vendor} onBlur={(e) => onVendor(e.target.value)} /></Field>
        <datalist id="vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        <Field label="Description" className="col-span-2"><Input name="description" defaultValue={initial.description} required /></Field>
        <Field label="Category" className="col-span-2"><Select name="categoryId" value={categoryId} onChange={(e) => onCategory(e.target.value)} required><option value="" disabled>Pick one</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Tax treatment" className="col-span-2">
          <Select name="taxTreatment" value={treatment} onChange={(e) => setTreatment(e.target.value)}>
            <option value="BUSINESS_DIRECT">Business, 100% deductible</option>
            <option value="HOME_OFFICE_INDIRECT">Home office share (whole-house cost)</option>
            <option value="PARTIAL_USE">Partly business</option>
            <option value="PERSONAL">Personal, not deductible</option>
          </Select>
        </Field>
        {treatment === "PARTIAL_USE" && <Field label="Business %"><Input type="number" name="businessPercent" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} required /></Field>}
        {sources.length > 0 && <Field label="Paid from"><Select name="paymentSourceId" defaultValue={initial.paymentSourceId}><option value="">not set</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
        <Field label="Receipt" className="col-span-2"><Input type="file" name="receipt" accept="image/*,application/pdf" /></Field>
        <Field label="Notes" className="col-span-full"><Textarea name="notes" rows={2} defaultValue={initial.notes} /></Field>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : submitLabel}</Button>
    </form>
  );
}
