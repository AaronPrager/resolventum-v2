"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type ForgotState, forgotAction } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, {} as ForgotState);
  return (
    <form action={action} className="space-y-4" data-testid="forgot-form">
      <Field label="Email"><Input type="email" name="email" autoComplete="email" required autoFocus /></Field>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending" : "Send reset link"}</Button>
    </form>
  );
}
