"use client";

import { useActionState } from "react";
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

export function LessonForm({
  action,
  studentId,
  lessonId,
  tutors,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  studentId: string;
  lessonId?: string;
  tutors: { id: string; name: string }[];
  initial: LessonFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const field = "rounded border border-gray-300 px-2 py-1";
  const label = "flex flex-col gap-1 text-sm";
  return (
    <form action={formAction} className="space-y-3" data-testid="lesson-form">
      <input type="hidden" name="studentId" value={studentId} />
      {lessonId && <input type="hidden" name="lessonId" value={lessonId} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={label}><span>Date</span><input className={field} type="date" name="date" defaultValue={initial.date} required /></label>
        <label className={label}><span>Time</span><input className={field} type="time" name="time" defaultValue={initial.time} required /></label>
        <label className={label}><span>Minutes</span><input className={field} type="number" name="durationMin" min={1} max={1440} defaultValue={initial.durationMin} required /></label>
        <label className={label}><span>Price</span><input className={field} type="text" inputMode="decimal" name="price" defaultValue={initial.price} required /></label>
        <label className={`${label} col-span-2`}><span>Subject</span><input className={field} type="text" name="subject" defaultValue={initial.subject} required /></label>
        <label className={label}><span>Tutor</span>
          <select className={field} name="tutorId" defaultValue={initial.tutorId}>
            <option value="">None</option>
            {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className={label}><span>Where</span>
          <select className={field} name="locationType" defaultValue={initial.locationType}>
            <option value="IN_PERSON">In person</option>
            <option value="REMOTE">Remote</option>
          </select>
        </label>
        <label className={label}><span>Category</span>
          <select className={field} name="category" defaultValue={initial.category}>
            <option value="">None</option>
            <option value="TUTORING">Tutoring</option>
            <option value="COLLEGE_COUNSELING">College counseling</option>
          </select>
        </label>
        <label className={`${label} col-span-3`}><span>Meeting link</span><input className={field} type="url" name="meetingLink" defaultValue={initial.meetingLink} /></label>
        <label className={`${label} col-span-full`}><span>Notes</span><textarea className={field} name="notes" rows={2} defaultValue={initial.notes} /></label>
      </div>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {pending ? "Saving" : submitLabel}
      </button>
    </form>
  );
}
