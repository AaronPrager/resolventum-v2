"use client";

import { useActionState, useState } from "react";
import { Button, Checkbox, Field, FormError, FormOk, Input, Textarea } from "@/src/components/ui";
import { type ActionState, saveGuardianAction, updateAccountAction } from "../actions";

export function AccountForm({ accountId, name, notes }: { accountId: string; name: string; notes: string }) {
  const [state, action, pending] = useActionState(updateAccountAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="account-form">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label="Account name"><Input name="name" defaultValue={name} required /></Field>
        <Field label="Notes"><Textarea name="notes" rows={1} defaultValue={notes} placeholder="Pays on the 1st, prefers Zelle" /></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Save"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}

export interface GuardianValues { id?: string; name: string; email: string; phone: string; relationship: string; address: string; isPrimary: boolean; isBilling: boolean; isEmergency: boolean }

export function GuardianForm({ accountId, guardian }: { accountId: string; guardian?: GuardianValues }) {
  const [state, action, pending] = useActionState(saveGuardianAction, {} as ActionState);
  const [key, setKey] = useState(0);
  const g = guardian;
  return (
    <form
      key={key}
      action={async (fd) => {
        await action(fd);
        if (!g) setKey((k) => k + 1);
      }}
      className="space-y-3"
      data-testid={g?.id ? `guardian-form-${g.id}` : "guardian-form-new"}
    >
      <input type="hidden" name="accountId" value={accountId} />
      {g?.id && <input type="hidden" name="guardianId" value={g.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name" className="col-span-2 sm:col-span-1"><Input name="name" defaultValue={g?.name ?? ""} required /></Field>
        <Field label="Relationship"><Input name="relationship" defaultValue={g?.relationship ?? ""} placeholder="Mother" /></Field>
        <Field label="Email"><Input type="email" name="email" defaultValue={g?.email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={g?.phone ?? ""} /></Field>
        <Field label="Address" className="col-span-full"><Input name="address" defaultValue={g?.address ?? ""} /></Field>
      </div>
      <div className="flex flex-wrap gap-5">
        <Checkbox name="isPrimary" defaultChecked={g?.isPrimary ?? false} label="Main contact" />
        <Checkbox name="isBilling" defaultChecked={g?.isBilling ?? false} label="Gets statements" />
        <Checkbox name="isEmergency" defaultChecked={g?.isEmergency ?? false} label="Emergency contact" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant={g ? "secondary" : "primary"} disabled={pending}>{pending ? "Saving" : g ? "Save contact" : "Add contact"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}
