"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type ActionState, issueMakeupAction } from "../actions";

export function MakeupForm({ lessonId, studentId }: { lessonId: string; studentId: string }) {
  const [state, action, pending] = useActionState(issueMakeupAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="makeup-form">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Field label="Reason (optional)" className="max-w-md"><Input name="reason" placeholder="Goodwill, tutor was late" /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending || !!state.ok}>{pending ? "Crediting" : "Give a make-up credit"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}
