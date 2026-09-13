"use client";

import { useActionState } from "react";
import { Badge, Button, Field, FormError, FormOk, Input, Select, Textarea } from "@/src/components/ui";
import { type ActionState, approveDraftAction, draftFeedbackAction, feedbackAction, regenerateLinkAction, updateAssignmentAction } from "../actions";

export function AssignmentEditor({ assignmentId, title, description, dueOn }: { assignmentId: string; title: string; description: string; dueOn: string }) {
  const [state, action, pending] = useActionState(updateAssignmentAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Title" className="col-span-2"><Input name="title" defaultValue={title} required /></Field>
        <Field label="Due"><Input type="date" name="dueOn" defaultValue={dueOn} /></Field>
        <Field label="Instructions" className="col-span-3"><Textarea name="description" rows={3} defaultValue={description} /></Field>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Save"}</Button>
    </form>
  );
}

export function LinkBox({ assignmentId, origin, hasLink, status }: { assignmentId: string; origin: string; hasLink: boolean; status: string }) {
  const [state, action, pending] = useActionState(regenerateLinkAction, {} as ActionState);
  return (
    <div className="space-y-2 text-sm">
      {state.link ? (
        <div className="rounded-md bg-brand-soft p-3" data-testid="upload-link">
          <p className="font-medium">Send this to the student:</p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{state.link}</code>
        </div>
      ) : hasLink ? <p>A link exists. It was shown when made; get a new one below (the old one stops working).</p> : <p>No link yet.</p>}
      <form action={action}>
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="origin" value={origin} />
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Working" : hasLink || state.link ? "New link" : "Make a link"}</Button>
      </form>
      <FormError>{state.error}</FormError>
      {status === "PENDING" && !state.link && <p className="text-muted">Making a link marks the assignment as sent.</p>}
    </div>
  );
}

export function FeedbackForm({ submissionId, assignmentId }: { submissionId: string; assignmentId: string }) {
  const [state, action, pending] = useActionState(feedbackAction, {} as ActionState);
  return (
    <form action={action} className="space-y-2" data-testid="feedback-form">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field label="Your feedback"><Textarea name="comment" rows={3} required /></Field>
      <div className="flex items-end gap-3">
        <Field label="Score (1 to 5)"><Select name="score" defaultValue=""><option value="">none</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save feedback"}</Button>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}

export function AiButton({ submissionId, assignmentId, configured }: { submissionId: string; assignmentId: string; configured: boolean }) {
  const [state, action, pending] = useActionState(draftFeedbackAction, {} as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" variant="secondary" disabled={pending || !configured}>{pending ? "Reading the work" : "Draft feedback with AI"}</Button>
      {!configured && <span className="text-xs text-muted">Set GEMINI_API_KEY on the server to turn this on.</span>}
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}

export function DraftReview({ draft, assignmentId, discardAction }: { draft: { id: string; content: Record<string, unknown>; model: string }; assignmentId: string; discardAction: (fd: FormData) => Promise<void> }) {
  const [state, action, pending] = useActionState(approveDraftAction, {} as ActionState);
  const c = draft.content;
  const list = (k: string) => (Array.isArray(c[k]) ? (c[k] as string[]) : []);
  const mastery = Array.isArray(c.mastery) ? (c.mastery as { topic: string; score: number }[]) : [];
  return (
    <div className="mt-3 space-y-3 rounded-md border border-brand/30 bg-brand-soft/40 p-3" data-testid="draft-review">
      <div className="flex items-center gap-2 text-sm"><Badge tone="brand">AI draft</Badge><span className="text-muted">Edit anything, then approve. Nothing is saved until you do.</span></div>
      {list("strengths").length > 0 && <p className="text-sm"><span className="text-muted">Strengths: </span>{list("strengths").join("; ")}</p>}
      {list("mistakes").length > 0 && <p className="text-sm"><span className="text-muted">Mistakes: </span>{list("mistakes").join("; ")}</p>}
      {mastery.length > 0 && <p className="text-sm"><span className="text-muted">Mastery: </span>{mastery.map((m) => `${m.topic} ${m.score}/5`).join(", ")}</p>}
      <form action={action} className="space-y-2">
        <input type="hidden" name="draftId" value={draft.id} />
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <Field label="Feedback to the student"><Textarea name="comment" rows={5} defaultValue={String(c.comment ?? "")} required /></Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Score"><Select name="score" defaultValue={String(c.score ?? 3)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Button type="submit" disabled={pending}>{pending ? "Saving" : "Approve and save"}</Button>
        </div>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </form>
      <form action={discardAction}><input type="hidden" name="draftId" value={draft.id} /><input type="hidden" name="assignmentId" value={assignmentId} /><Button variant="link" className="text-xs text-muted">Discard draft</Button></form>
    </div>
  );
}
