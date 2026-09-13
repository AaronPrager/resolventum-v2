"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/src/components/ui";
import { type ResetState, resetAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetAction, {} as ResetState);
  return (
    <form action={action} className="space-y-4" data-testid="reset-form">
      <input type="hidden" name="token" value={token} />
      <Field label="New password"><Input type="password" name="password" autoComplete="new-password" minLength={10} required autoFocus /></Field>
      <Field label="Again"><Input type="password" name="confirm" autoComplete="new-password" minLength={10} required /></Field>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving" : "Save password"}</Button>
    </form>
  );
}
