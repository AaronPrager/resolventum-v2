"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/src/components/ui";
import { type LoginState, loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, {} as LoginState);
  return (
    <form action={action} className="space-y-4" data-testid="login-form">
      <input type="hidden" name="next" value={next} />
      <Field label="Email"><Input type="email" name="email" autoComplete="email" required autoFocus /></Field>
      <Field label="Password"><Input type="password" name="password" autoComplete="current-password" required /></Field>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in" : "Sign in"}</Button>
    </form>
  );
}
