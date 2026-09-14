"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button, Field, FormError, FormOk, Input, Textarea } from "@/src/components/ui";
import { type ActionState, saveSessionNoteAction, shareSessionNoteAction } from "./actions";

export interface NoteValues { covered: string; homework: string; engagement: string; win: string; struggle: string; nextGoal: string }
const ENGAGEMENT = [["1", "checked out"], ["2", "distracted"], ["3", "steady"], ["4", "engaged"], ["5", "fully engaged"]] as const;

/**
 * The note for one student on one lesson. Six boxes, all short: written in the
 * parking lot before the tutor forgets. Only "covered" is required.
 */
export function SessionNoteForm({ lessonId, studentId, studentFirst, initial }: { lessonId: string; studentId: string; studentFirst: string; initial: NoteValues | null }) {
  const [state, action, pending] = useActionState(saveSessionNoteAction, {} as ActionState);
  const v = initial ?? { covered: "", homework: "", engagement: "", win: "", struggle: "", nextGoal: "" };
  return (
    <form action={action} className="space-y-3" data-testid={`note-form-${studentId}`}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What we covered" className="sm:col-span-2"><Textarea name="covered" rows={2} defaultValue={v.covered} placeholder="Quadratics, factoring by grouping" required autoFocus={!initial} /></Field>
        <Field label="A win"><Input name="win" defaultValue={v.win} placeholder={`Something ${studentFirst} got right`} /></Field>
        <Field label="A struggle"><Input name="struggle" defaultValue={v.struggle} placeholder="What still trips them up" /></Field>
        <Field label="Homework"><Input name="homework" defaultValue={v.homework} placeholder="p. 42, 1 to 10" /></Field>
        <Field label="Next lesson's goal"><Input name="nextGoal" defaultValue={v.nextGoal} placeholder="Complete the square" /></Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-[13px] font-medium text-fg/80">Engagement</legend>
          <div className="flex flex-wrap gap-1.5">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
              <input type="radio" name="engagement" value="" defaultChecked={!v.engagement} className="sr-only" />not rated
            </label>
            {ENGAGEMENT.map(([n, label]) => (
              <label key={n} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                <input type="radio" name="engagement" value={n} defaultChecked={v.engagement === n} className="sr-only" />{n} · {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={initial ? "secondary" : "primary"} disabled={pending}>{pending ? "Saving" : initial ? "Save note" : "Save note"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}

/** Email the note to the family. The address is filled in from the main contact and can be changed. */
export function ShareNoteForm({ lessonId, noteId, defaultTo, disabled, sharedTo, sharedAt }: { lessonId: string; noteId: string; defaultTo: string; disabled: boolean; sharedTo: string | null; sharedAt: string | null }) {
  const [state, action, pending] = useActionState(shareSessionNoteAction, {} as ActionState);
  return (
    <form action={action} className="space-y-2" data-testid={`share-note-${noteId}`}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="noteId" value={noteId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Send to" className="w-72"><Input type="email" name="to" defaultValue={defaultTo} required /></Field>
        <Button type="submit" variant="secondary" disabled={pending || disabled}><Send aria-hidden />{pending ? "Sending" : sharedAt ? "Send again" : "Send to the family"}</Button>
      </div>
      <p className="text-xs text-muted">{sharedAt ? `Sent to ${sharedTo} on ${sharedAt}.` : "Not sent yet. The nightly job sends unshared notes when that switch is on in Settings."}</p>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
