"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { Button, Field, FormError, FormOk, Input, LinkButton, Select, Textarea } from "@/src/components/ui";
import { type ActionState, saveNoteAction, shareNoteAction } from "./actions";

export interface LessonOption { id: string; label: string; noted: boolean }
export interface NoteValues { covered: string; win: string; struggle: string; homework: string; nextGoal: string; engagement: string; notedOn: string }

const GENERAL = "";
const ENGAGEMENT = [["1", "checked out"], ["2", "distracted"], ["3", "steady"], ["4", "engaged"], ["5", "fully engaged"]] as const;
const EMPTY: NoteValues = { covered: "", win: "", struggle: "", homework: "", nextGoal: "", engagement: "", notedOn: "" };

/**
 * The one form for session notes, new or rewritten, reached from the notes
 * page, a lesson, or the student panel. A note is about one of the student's
 * recent lessons, or general with its own date. Only "covered" is required.
 */
export function NoteForm({ students, lessonsByStudent, defaults, locked, today, returnTo, noteId, initial }: {
  students: { id: string; name: string; first: string }[];
  lessonsByStudent: Record<string, LessonOption[]>;
  defaults: { studentId: string; lessonId: string };
  /** Editing: the student and lesson stay as they are. */
  locked?: { student: string; lesson: string | null };
  today: string;
  returnTo: string;
  noteId?: string;
  initial?: NoteValues;
}) {
  const [studentId, setStudentId] = useState(defaults.studentId);
  const [lessonId, setLessonId] = useState(defaults.lessonId);
  const [state, action, pending] = useActionState(saveNoteAction, {} as ActionState);
  const v = initial ?? EMPTY;
  const lessons = lessonsByStudent[studentId] ?? [];
  const student = students.find((s) => s.id === studentId);
  const general = lessonId === GENERAL;
  return (
    <form action={action} className="space-y-4" data-testid="note-form">
      {noteId && <input type="hidden" name="noteId" value={noteId} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      {locked && <input type="hidden" name="studentId" value={studentId} />}
      {locked && <input type="hidden" name="lessonId" value={lessonId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {locked ? (
          <>
            <Field label="Student"><p className="pt-1.5 text-sm">{locked.student}</p></Field>
            <Field label="About"><p className="pt-1.5 text-sm">{locked.lesson ?? "General, not tied to a lesson"}</p></Field>
          </>
        ) : (
          <>
            <Field label="Student">
              <Select name="studentId" value={studentId} onChange={(e) => { setStudentId(e.target.value); setLessonId(lessonsByStudent[e.target.value]?.[0]?.id ?? GENERAL); }} required>
                <option value="" disabled>Pick a student</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="About" hint={lessons.length === 0 && studentId ? "No recent lessons, so this will be a general note." : undefined}>
              <Select name="lessonId" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                <option value={GENERAL}>General, not tied to a lesson</option>
                {lessons.map((l) => <option key={l.id} value={l.id}>{l.label}{l.noted ? " (has a note)" : ""}</option>)}
              </Select>
            </Field>
          </>
        )}
        {general && <Field label="Date"><Input type="date" name="notedOn" defaultValue={v.notedOn || today} required /></Field>}
        <Field label="What we covered" className="sm:col-span-2"><Textarea name="covered" rows={3} defaultValue={v.covered} placeholder={general ? `Something about ${student?.first ?? "the student"} worth keeping` : "Quadratics, factoring by grouping"} required autoFocus={!initial} /></Field>
        <Field label="A win"><Input name="win" defaultValue={v.win} placeholder={`Something ${student?.first ?? "they"} got right`} /></Field>
        <Field label="A struggle"><Input name="struggle" defaultValue={v.struggle} placeholder="What still trips them up" /></Field>
        <Field label="Homework"><Input name="homework" defaultValue={v.homework} placeholder="p. 42, 1 to 10" /></Field>
        <Field label="Next lesson's goal"><Input name="nextGoal" defaultValue={v.nextGoal} placeholder="Complete the square" /></Field>
        {!general && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-fg/80">Engagement</legend>
            <div className="flex flex-wrap gap-1.5">
              <label className="inline-flex cursor-pointer items-center rounded-full border border-line px-2.5 py-1 text-xs has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                <input type="radio" name="engagement" value="" defaultChecked={!v.engagement} className="sr-only" />not rated
              </label>
              {ENGAGEMENT.map(([n, label]) => (
                <label key={n} className="inline-flex cursor-pointer items-center rounded-full border border-line px-2.5 py-1 text-xs has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                  <input type="radio" name="engagement" value={n} defaultChecked={v.engagement === n} className="sr-only" />{n} · {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save note"}</Button>
        <LinkButton href={returnTo} variant="ghost">Cancel</LinkButton>
        <FormError>{state.error}</FormError>
      </div>
    </form>
  );
}

/** Email the note to the family. The address is filled in from the main contact and can be changed. */
export function ShareNoteForm({ noteId, defaultTo, disabled, sharedTo, sharedAt }: { noteId: string; defaultTo: string; disabled: boolean; sharedTo: string | null; sharedAt: string | null }) {
  const [state, action, pending] = useActionState(shareNoteAction, {} as ActionState);
  return (
    <form action={action} className="space-y-2" data-testid={`share-note-${noteId}`}>
      <input type="hidden" name="noteId" value={noteId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Send to" className="w-72"><Input type="email" name="to" defaultValue={defaultTo} required /></Field>
        <Button type="submit" variant="secondary" disabled={pending || disabled}><Send aria-hidden />{pending ? "Sending" : sharedAt ? "Send again" : "Send to the family"}</Button>
      </div>
      <p className="text-xs text-muted">{sharedAt ? `Sent to ${sharedTo} on ${sharedAt}.` : "Not sent yet. The nightly job sends unshared notes when that switch is on in Office."}</p>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
