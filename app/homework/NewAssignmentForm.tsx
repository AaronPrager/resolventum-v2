"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, Input, LinkButton, Select, Textarea } from "@/src/components/ui";
import { type ActionState, createAssignmentAction } from "./actions";

export interface LessonOption { id: string; label: string }

/**
 * The one form for setting homework, reached from the homework page or a
 * student's panel. It can follow one of the student's recent lessons.
 */
export function NewAssignmentForm({ students, lessonsByStudent, library, defaultStudentId, defaultLessonId, returnTo }: {
  students: { id: string; name: string }[];
  lessonsByStudent: Record<string, LessonOption[]>;
  library: { id: string; name: string; folder: string | null }[];
  defaultStudentId?: string;
  defaultLessonId?: string;
  returnTo?: string;
}) {
  const [studentId, setStudentId] = useState(defaultStudentId ?? "");
  const [lessonId, setLessonId] = useState(defaultLessonId ?? "");
  const [state, action, pending] = useActionState(createAssignmentAction, {} as ActionState);
  const lessons = lessonsByStudent[studentId] ?? [];
  return (
    <form action={action} className="space-y-4" data-testid="assignment-form">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Student" className="col-span-2 sm:col-span-1"><Select name="studentId" value={studentId} onChange={(e) => { setStudentId(e.target.value); setLessonId(""); }} required><option value="" disabled>Pick a student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="After lesson" className="col-span-2 sm:col-span-1"><Select name="lessonId" value={lessonId} onChange={(e) => setLessonId(e.target.value)}><option value="">None in particular</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select></Field>
        <Field label="Title" className="col-span-2"><Input name="title" required placeholder="Worksheet 3, problems 1 to 20" /></Field>
        <Field label="Due"><Input type="date" name="dueOn" /></Field>
        <Field label="Instructions" className="col-span-full"><Textarea name="description" rows={2} /></Field>
        {library.length > 0 && (
          <Field label="Attach from the library (hold Cmd to pick several)" className="col-span-full">
            <Select name="fileIds" multiple size={Math.min(6, library.length)}>
              {library.map((f) => <option key={f.id} value={f.id}>{f.folder ? `${f.folder} / ` : ""}{f.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Create assignment"}</Button>
        <LinkButton href={returnTo ?? "/homework"} variant="ghost">Cancel</LinkButton>
        <FormError>{state.error}</FormError>
      </div>
    </form>
  );
}
