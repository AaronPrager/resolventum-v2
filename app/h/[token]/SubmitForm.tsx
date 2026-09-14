"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input, Textarea } from "@/src/components/ui";
import { type SubmitState, submitAction } from "./actions";
import { FileInput } from "@/src/components/FileInput";

export function SubmitForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitAction, {} as SubmitState);
  return (
    <form action={action} className="space-y-3" data-testid="submit-form">
      <input type="hidden" name="token" value={token} />
      <h2 className="text-sm font-semibold">Send your work</h2>
      <Field label="PDF or photos (up to 10)" hint="On a phone you can take a photo of each page."><FileInput name="files" multiple maxFiles={10} accept="application/pdf,image/*" /></Field>
      <Field label="A note for your tutor (optional)"><Textarea name="note" rows={2} /></Field>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" disabled={pending}>{pending ? "Sending" : "Send"}</Button>
    </form>
  );
}
