"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type ActionState, emailLinkAction } from "../actions";

/** Make a fresh link and email it in one step. */
export function EmailLink({ assignmentId, origin, defaultTo, configured }: { assignmentId: string; origin: string; defaultTo: string; configured: boolean }) {
  const [state, action, pending] = useActionState(emailLinkAction, {} as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="email-link">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="origin" value={origin} />
      <Field label="Email the link to"><Input type="email" name="to" defaultValue={defaultTo} required className="w-64" /></Field>
      <Button type="submit" disabled={pending || !configured}>{pending ? "Sending" : "Send"}</Button>
      {!configured && <span className="text-xs text-muted">Email is off on this server.</span>}
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
