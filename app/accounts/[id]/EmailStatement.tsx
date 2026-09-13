"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type EmailState, emailStatementAction } from "./emailActions";

export function EmailStatement({ accountId, defaultTo, from, to, configured }: { accountId: string; defaultTo: string; from: string; to: string; configured: boolean }) {
  const [state, action, pending] = useActionState(emailStatementAction, {} as EmailState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="email-statement">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <Field label="Email the statement to"><Input type="email" name="to" defaultValue={defaultTo} required className="w-64" /></Field>
      <Button type="submit" variant="secondary" disabled={pending || !configured}>{pending ? "Sending" : "Send"}</Button>
      <Button type="button" variant="secondary" onClick={() => window.print()}>Print</Button>
      {!configured && <span className="text-xs text-muted">Email is off on this server.</span>}
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
