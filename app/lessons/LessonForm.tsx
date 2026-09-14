"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Checkbox, Field, FormError, Input, Radio, Select, Textarea } from "@/src/components/ui";
import type { ActionState } from "./actions";

export interface LessonFormValues {
  date: string;
  time: string;
  durationMin: number;
  subject: string;
  tutorId: string;
  locationType: "IN_PERSON" | "REMOTE";
  meetingLink: string;
  notes: string;
  category: "" | "TUTORING" | "COLLEGE_COUNSELING";
  allDay?: boolean;
  /** The roster. Empty for an event with no student. */
  seats: { studentId: string; price: string }[];
}

export interface StudentChoice {
  id: string;
  name: string;
  /** "130.00", filled in when the student is picked and the price is empty. */
  defaultPrice: string;
  defaultSubject?: string;
}

export function LessonForm({ action, students, lessonId, inSeries, tutors, initial, submitLabel, allowRepeat, returnTo }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  students: StudentChoice[];
  lessonId?: string;
  inSeries?: boolean;
  tutors: { id: string; name: string }[];
  initial: LessonFormValues;
  submitLabel: string;
  allowRepeat?: boolean;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const [allDay, setAllDay] = useState(!!initial.allDay);
  const [seats, setSeats] = useState(initial.seats);
  const [subject, setSubject] = useState(initial.subject);
  const byId = new Map(students.map((s) => [s.id, s]));
  const isEvent = seats.length === 0;
  const taken = new Set(seats.map((s) => s.studentId).filter(Boolean));

  function pick(i: number, studentId: string) {
    if (studentId === "none") {
      setSeats([]);
      return;
    }
    const st = byId.get(studentId);
    setSeats((rows) => rows.map((r, j) => (j === i ? { studentId, price: r.price || st?.defaultPrice || "" } : r)));
    if (!subject && st?.defaultSubject && seats.length <= 1) setSubject(st.defaultSubject);
  }

  return (
    <form action={formAction} className="space-y-5" data-testid="lesson-form">
      {lessonId && <input type="hidden" name="lessonId" value={lessonId} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      <fieldset className="space-y-2" data-testid="roster">
        <legend className="mb-1.5 text-[13px] font-medium text-fg/80">{seats.length > 1 ? `Group of ${seats.length}` : "Student"}</legend>
        {isEvent ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface-2/60 px-3 py-2 text-sm text-muted">
            No students, so no charge. This is an event or a block of time.
            <Button type="button" variant="ghost" onClick={() => setSeats([{ studentId: "", price: "" }])}><Plus aria-hidden />Add a student</Button>
          </div>
        ) : (
          <>
            {seats.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2 sm:max-w-xl">
                <input type="hidden" name="seatStudentId" value={row.studentId} />
                <Select aria-label={i === 0 ? "Student" : `Student ${i + 1}`} value={row.studentId} onChange={(e) => pick(i, e.target.value)} required>
                  <option value="" disabled>Pick a student</option>
                  {students.map((s) => <option key={s.id} value={s.id} disabled={taken.has(s.id) && s.id !== row.studentId}>{s.name}</option>)}
                  {seats.length === 1 && <option value="none">No student (an event)</option>}
                </Select>
                <Input
                  aria-label={i === 0 ? "Price" : `Price ${i + 1}`}
                  name="seatPrice"
                  inputMode="decimal"
                  placeholder="Price"
                  value={row.price}
                  onChange={(e) => setSeats((rows) => rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setSeats((rows) => rows.filter((_, j) => j !== i))}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-faint hover:bg-surface-3 hover:text-fg"
                  aria-label={`Remove ${byId.get(row.studentId)?.name ?? "this row"}`}
                  title={seats.length === 1 ? "Remove the student (makes this an event)" : "Take off the lesson"}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setSeats((rows) => [...rows, { studentId: "", price: "" }])}>
              <Plus aria-hidden />{seats.length === 1 ? "Make it a group" : "Add a student"}
            </Button>
          </>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date"><Input type="date" name="date" defaultValue={initial.date} required /></Field>
        <Field label="Time"><Input type="time" name="time" defaultValue={initial.time} required={!allDay} disabled={allDay} /></Field>
        <Field label="Minutes"><Input type="number" name="durationMin" min={1} max={1440} defaultValue={initial.durationMin} required={!allDay} disabled={allDay} /></Field>
        <div className="flex items-end pb-2"><Checkbox name="allDay" label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /></div>
        <Field label={isEvent ? "Title" : "Subject"} className="col-span-2"><Input type="text" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required /></Field>
        <Field label="Tutor"><Select name="tutorId" defaultValue={initial.tutorId}><option value="">None</option>{tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Where"><Select name="locationType" defaultValue={initial.locationType}><option value="IN_PERSON">In person</option><option value="REMOTE">Remote</option></Select></Field>
        <Field label="Category"><Select name="category" defaultValue={initial.category}><option value="">None</option><option value="TUTORING">Tutoring</option><option value="COLLEGE_COUNSELING">College counseling</option></Select></Field>
        <Field label="Meeting link" className="col-span-2 sm:col-span-3"><Input type="url" name="meetingLink" defaultValue={initial.meetingLink} /></Field>
        <Field label="Notes" className="col-span-full"><Textarea name="notes" rows={2} defaultValue={initial.notes} /></Field>
      </div>
      {allowRepeat && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <Checkbox name="repeat" label="Repeat every" />
          <span className="inline-flex items-center gap-1.5"><Input className="w-16" type="number" name="intervalWeeks" min={1} max={52} defaultValue={1} aria-label="Interval in weeks" /> week(s)</span>
          <label className="inline-flex items-center gap-2">until <Input className="w-auto" type="date" name="until" /></label>
          <span className="text-xs text-muted">Leave &quot;until&quot; empty to keep going; lessons are made six months ahead.</span>
        </fieldset>
      )}
      {inSeries && (
        <fieldset className="flex flex-wrap gap-4 rounded-lg bg-surface-2 px-3 py-2">
          <Radio name="scope" value="one" defaultChecked label="This lesson only" />
          <Radio name="scope" value="future" label="This and all later lessons in the series" />
        </fieldset>
      )}
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : submitLabel}</Button>
    </form>
  );
}
