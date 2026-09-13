"use client";

import { useActionState } from "react";
import { Button, Checkbox, Field, FormError, FormOk, Input, Select } from "@/src/components/ui";
import { type ActionState, createCategoryAction, taxYearAction } from "../actions";

export function TaxYearForm({ year, homeSqft, officeSqft, percent, filed }: { year: number; homeSqft: number | null; officeSqft: number | null; percent: string; filed: boolean }) {
  const [state, action, pending] = useActionState(taxYearAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="tax-year-form">
      <input type="hidden" name="year" value={year} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Home sq ft"><Input type="number" name="homeSqft" defaultValue={homeSqft ?? ""} /></Field>
        <Field label="Office sq ft"><Input type="number" name="officeSqft" defaultValue={officeSqft ?? ""} /></Field>
        <Field label="Or percent" hint="wins if set"><Input type="text" inputMode="decimal" name="homeOfficePercent" defaultValue={percent} placeholder="12.5" /></Field>
      </div>
      <Checkbox name="filed" defaultChecked={filed} label={`The ${year} return is filed`} />
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Save"}</Button>
    </form>
  );
}

export function CategoryForm() {
  const [state, action, pending] = useActionState(createCategoryAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Name"><Input name="name" required /></Field>
        <Field label="Default treatment"><Select name="defaultTaxTreatment" defaultValue="BUSINESS_DIRECT"><option value="BUSINESS_DIRECT">Business, 100%</option><option value="HOME_OFFICE_INDIRECT">Home office share</option><option value="PARTIAL_USE">Partly business</option><option value="PERSONAL">Personal</option></Select></Field>
        <Field label="Schedule C line"><Input name="scheduleCLine" placeholder="Line 22" /></Field>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Add category"}</Button>
    </form>
  );
}
