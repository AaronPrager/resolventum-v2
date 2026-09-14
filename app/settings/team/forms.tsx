"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Button, Field, FormError, FormOk, Input, Select } from "@/src/components/ui";
import { type InviteState, inviteAction } from "./actions";

export function InviteForm({ roles }: { roles: [string, string][] }) {
  const [state, action, pending] = useActionState(inviteAction, {} as InviteState);
  return (
    <form action={action} className="space-y-3" data-testid="invite-form">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <Field label="Email"><Input type="email" name="email" required placeholder="tutor@example.com" /></Field>
        <Field label="Role">
          <Select name="role" defaultValue="TUTOR">{roles.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select>
        </Field>
        <Button type="submit" disabled={pending}><UserPlus aria-hidden />{pending ? "Inviting" : "Invite"}</Button>
      </div>
      <FormError>{state.error}</FormError>
      {state.ok && (
        <div className="space-y-1.5">
          <FormOk>{state.ok}</FormOk>
          {state.link && <code className="block break-all rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs" data-testid="invite-link">{state.link}</code>}
        </div>
      )}
    </form>
  );
}
