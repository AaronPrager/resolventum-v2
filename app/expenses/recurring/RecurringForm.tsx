"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input, Select } from "@/src/components/ui";
import { type ActionState, createRecurringAction } from "../actions";

export function RecurringForm({ categories, vendors, sources }: { categories: { id: string; name: string }[]; vendors: string[]; sources: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createRecurringAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="recurring-form">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Description" className="col-span-2"><Input name="description" required /></Field>
        <Field label="Vendor"><Input name="vendor" list="rvendors" /></Field>
        <datalist id="rvendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
        <Field label="Amount"><Input type="text" inputMode="decimal" name="amount" required /></Field>
        <Field label="Category" className="col-span-2"><Select name="categoryId" defaultValue="" required><option value="" disabled>Pick one</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Treatment"><Select name="taxTreatment" defaultValue="BUSINESS_DIRECT"><option value="BUSINESS_DIRECT">Business, 100%</option><option value="HOME_OFFICE_INDIRECT">Home office share</option><option value="PARTIAL_USE">Partly business</option><option value="PERSONAL">Personal</option></Select></Field>
        <Field label="Business % (partly)"><Input type="number" name="businessPercent" min={0} max={100} /></Field>
        <Field label="Every"><Select name="frequency" defaultValue="MONTHLY"><option value="MONTHLY">Month</option><option value="YEARLY">Year</option></Select></Field>
        <Field label="First on"><Input type="date" name="startOn" required /></Field>
        <Field label="Until"><Input type="date" name="endsOn" /></Field>
        {sources.length > 0 && <Field label="Paid from"><Select name="paymentSourceId" defaultValue=""><option value="">not set</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : "Add"}</Button>
    </form>
  );
}
