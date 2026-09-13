"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input, Textarea } from "@/src/components/ui";
import { type UpdateState, approveUpdateAction, discardUpdateAction, draftUpdateAction, sendUpdateAction } from "./actions";

export function DraftForm({ studentId, from, to, configured }: { studentId: string; from: string; to: string; configured: boolean }) {
  const [state, action, pending] = useActionState(draftUpdateAction, {} as UpdateState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="draft-update-form">
      <input type="hidden" name="studentId" value={studentId} />
      <Field label="From"><Input type="date" name="from" defaultValue={from} required /></Field>
      <Field label="To"><Input type="date" name="to" defaultValue={to} required /></Field>
      <Button type="submit" disabled={pending || !configured}>{pending ? "Writing" : "Draft with AI"}</Button>
      {!configured && <span className="text-xs text-muted">Set GEMINI_API_KEY on the server to turn this on.</span>}
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}

export function UpdateReview({ draft, studentId, defaultTo, emailOn }: { draft: { id: string; status: string; subject: string; body: string; highlights: string[]; nextFocus: string }; studentId: string; defaultTo: string; emailOn: boolean }) {
  const [state, action, pending] = useActionState(emailOn ? sendUpdateAction : approveUpdateAction, {} as UpdateState);
  const editable = draft.status === "DRAFT";
  return (
    <div className="space-y-3">
      {draft.highlights.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">{draft.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
      {draft.nextFocus && <p className="text-sm"><span className="text-muted">Next: </span>{draft.nextFocus}</p>}
      <form action={action} className="space-y-2">
        <input type="hidden" name="draftId" value={draft.id} />
        <input type="hidden" name="studentId" value={studentId} />
        <Field label="Subject"><Input name="subject" defaultValue={draft.subject} readOnly={!editable} required /></Field>
        <Field label="Email"><Textarea name="body" rows={12} defaultValue={draft.body} readOnly={!editable} required /></Field>
        {editable && emailOn && <Field label="Send to" className="max-w-sm"><Input type="email" name="to" defaultValue={defaultTo} required /></Field>}
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
        {editable && <Button type="submit" disabled={pending}>{pending ? (emailOn ? "Sending" : "Saving") : emailOn ? "Approve and send" : "Approve"}</Button>}
        {editable && !emailOn && <p className="text-xs text-muted">Email is off on this server; approve and copy the text into your mail.</p>}
      </form>
      {editable && <form action={discardUpdateAction}><input type="hidden" name="draftId" value={draft.id} /><input type="hidden" name="studentId" value={studentId} /><Button variant="link" className="text-xs text-muted">Discard</Button></form>}
    </div>
  );
}
