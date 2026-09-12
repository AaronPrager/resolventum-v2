"use client";

import { useActionState } from "react";
import { Button, Checkbox, Field, FormError, Input, Radio, Select, Textarea } from "@/src/components/ui";
import type { ActionState } from "./actions";

export interface LessonFormValues {
  date: string;
  time: string;
  durationMin: number;
  subject: string;
  price: string;
  tutorId: string;
  locationType: "IN_PERSON" | "REMOTE";
  meetingLink: string;
  notes: string;
  category: "" | "TUTORING" | "COLLEGE_COUNSELING";
}

export function LessonForm({ action, studentId, students, lessonId, inSeries, tutors, initial, submitLabel, allowRepeat, returnTo }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  studentId?: string;
  students?: { id: string; name: string }[];
  lessonId?: string;
  inSeries?: boolean;
  tutors: { id: string; name: string }[];
  initial: LessonFormValues;
  submitLabel: string;
  allowRepeat?: boolean;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" data-testid="lesson-form">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      {lessonId && <input type="hidden" name="lessonId" value={lessonId} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {students && (
        <Field label="Student" className="max-w-sm">
          <Select name="studentId" defaultValue="" required>
            <option value="" disabled>Pick a student</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date"><Input type="date" name="date" defaultValue={initial.date} required /></Field>
        <Field label="Time"><Input type="time" name="time" defaultValue={initial.time} required /></Field>
        <Field label="Minutes"><Input type="number" name="durationMin" min={1} max={1440} defaultValue={initial.durationMin} required /></Field>
        <Field label="Price"><Input type="text" inputMode="decimal" name="price" defaultValue={initial.price} required /></Field>
        <Field label="Subject" className="col-span-2"><Input type="text" name="subject" defaultValue={initial.subject} required /></Field>
        <Field label="Tutor"><Select name="tutorId" defaultValue={initial.tutorId}><option value="">None</option>{tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Where"><Select name="locationType" defaultValue={initial.locationType}><option value="IN_PERSON">In person</option><option value="REMOTE">Remote</option></Select></Field>
        <Field label="Category"><Select name="category" defaultValue={initial.category}><option value="">None</option><option value="TUTORING">Tutoring</option><option value="COLLEGE_COUNSELING">College counseling</option></Select></Field>
        <Field label="Meeting link" className="col-span-2 sm:col-span-3"><Input type="url" name="meetingLink" defaultValue={initial.meetingLink} /></Field>
        <Field label="Notes" className="col-span-full"><Textarea name="notes" rows={2} defaultValue={initial.notes} /></Field>
      </div>
      {allowRepeat && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
          <Checkbox name="repeat" label="Repeat every" />
          <span className="inline-flex items-center gap-1.5"><Input className="w-16" type="number" name="intervalWeeks" min={1} max={52} defaultValue={1} aria-label="Interval in weeks" /> week(s)</span>
          <label className="inline-flex items-center gap-2">until <Input className="w-auto" type="date" name="until" /></label>
          <span className="text-xs text-muted">Leave "until" empty to keep going; lessons are made six months ahead.</span>
        </fieldset>
      )}
      {inSeries && (
        <fieldset className="flex flex-wrap gap-4 rounded-md bg-surface-2 px-3 py-2">
          <Radio name="scope" value="one" defaultChecked label="This lesson only" />
          <Radio name="scope" value="future" label="This and all later lessons in the series" />
        </fieldset>
      )}
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : submitLabel}</Button>
    </form>
  );
}
