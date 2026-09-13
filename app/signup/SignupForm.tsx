"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Select } from "@/src/components/ui";
import { type SignupState, signupAction } from "./actions";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Berlin", "Asia/Jerusalem", "Australia/Sydney"];

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, {} as SignupState);
  return (
    <form action={action} className="space-y-4" data-testid="signup-form">
      <Field label="Your name"><Input name="name" autoComplete="name" required /></Field>
      <Field label="School or business name" hint="What families see on statements."><Input name="organizationName" required /></Field>
      <Field label="Email"><Input type="email" name="email" autoComplete="email" required /></Field>
      <Field label="Password" hint="At least 10 characters."><Input type="password" name="password" autoComplete="new-password" minLength={10} required /></Field>
      <Field label="Timezone"><Select name="timezone" defaultValue="America/New_York">{ZONES.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating" : "Create my account"}</Button>
    </form>
  );
}
