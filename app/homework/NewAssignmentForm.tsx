"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/src/components/ui";
import { type ActionState, createAssignmentAction } from "./actions";

export function NewAssignmentForm({ students, library, defaultStudentId }: { students: { id: string; name: string }[]; library: { id: string; name: string; folder: string | null }[]; defaultStudentId?: string }) {
  const [state, action, pending] = useActionState(createAssignmentAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="assignment-form">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Student"><Select name="studentId" defaultValue={defaultStudentId ?? ""} required><option value="" disabled>Pick a student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
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
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>{pending ? "Saving" : "Create assignment"}</Button>
    </form>
  );
}
