"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, Input, LinkButton, Select, Textarea } from "@/src/components/ui";
import { FileInput } from "@/src/components/FileInput";
import { UsedBefore, type UsedFileOption } from "./UsedBefore";
import { type ActionState, createAssignmentAction } from "./actions";

export interface LessonOption { id: string; label: string }

/**
 * The one form for setting homework, reached from the homework page or a
 * student's panel. It can follow one of the student's recent lessons, and
 * takes files from the computer or ones used before.
 */
export function NewAssignmentForm({ students, lessonsByStudent, used, defaultStudentId, defaultLessonId, returnTo }: {
  students: { id: string; name: string }[];
  lessonsByStudent: Record<string, LessonOption[]>;
  used: UsedFileOption[];
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
        <Field label="Files from your computer" className="col-span-full" hint="PDF, images, or Office files, up to 25 MB each."><FileInput name="files" multiple maxFiles={20} /></Field>
        {used.length > 0 && <div className="col-span-full"><UsedBefore files={used} /></div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Create assignment"}</Button>
        <LinkButton href={returnTo ?? "/homework"} variant="ghost">Cancel</LinkButton>
        <FormError>{state.error}</FormError>
      </div>
    </form>
  );
}
