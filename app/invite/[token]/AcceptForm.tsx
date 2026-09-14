"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/src/components/ui";
import { type AcceptState, acceptInviteAction } from "./actions";

export function AcceptForm({ token, email, hasAccount }: { token: string; email: string; hasAccount: boolean }) {
  const [state, action, pending] = useActionState(acceptInviteAction, {} as AcceptState);
  return (
    <form action={action} className="space-y-4" data-testid="accept-form">
      <input type="hidden" name="token" value={token} />
      <Field label="Email"><Input value={email} disabled /></Field>
      {!hasAccount && <Field label="Your name"><Input name="name" autoComplete="name" required autoFocus /></Field>}
      <Field label={hasAccount ? "Your password" : "Choose a password"} hint={hasAccount ? "You already have a Resolventum account with this email." : "At least 10 characters."}>
        <Input type="password" name="password" autoComplete={hasAccount ? "current-password" : "new-password"} minLength={hasAccount ? undefined : 10} required autoFocus={hasAccount} />
      </Field>
      <FormError>{state.error}</FormError>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Joining" : "Join"}</Button>
    </form>
  );
}
