"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type ActionState, receiptDraftAction } from "./actions";

/** Upload a receipt; the server reads it with AI and the page re-renders with the form prefilled. */
export function ReceiptBox({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(receiptDraftAction, {} as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="receipt-form">
      <Field label="Photo or PDF of a receipt"><Input type="file" name="receipt" accept="image/*,application/pdf" required /></Field>
      <Button type="submit" variant="secondary" disabled={pending || !configured}>{pending ? "Reading" : "Read it with AI"}</Button>
      {!configured && <span className="text-xs text-muted">Set GEMINI_API_KEY on the server to turn this on.</span>}
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
