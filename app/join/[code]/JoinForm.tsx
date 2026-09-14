"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Button, Checkbox, Field, FormError, Input, Textarea } from "@/src/components/ui";
import { type JoinState, joinAction } from "./actions";

export function JoinForm({ code, schoolName }: { code: string; schoolName: string }) {
  const [state, action, pending] = useActionState(joinAction, {} as JoinState);
  if (state.done) {
    return (
      <div className="py-6 text-center" role="status" data-testid="join-done">
        <CircleCheck className="mx-auto mb-3 size-10 text-credit" aria-hidden />
        <p className="text-[15px] font-medium">{state.done}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" data-testid="join-form">
      <input type="hidden" name="code" value={code} />
      <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Student</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input name="studentFirstName" required autoComplete="off" /></Field>
          <Field label="Last name"><Input name="studentLastName" required autoComplete="off" /></Field>
          <Field label="Grade"><Input name="grade" placeholder="8" /></Field>
          <Field label="School"><Input name="school" /></Field>
          <Field label="Student email" hint="Optional, for homework links"><Input type="email" name="studentEmail" /></Field>
          <Field label="Student phone" hint="Optional"><Input name="studentPhone" /></Field>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Parent or guardian</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2"><Input name="parentName" required autoComplete="name" /></Field>
          <Field label="Email"><Input type="email" name="parentEmail" required autoComplete="email" /></Field>
          <Field label="Phone"><Input name="parentPhone" autoComplete="tel" /></Field>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Lessons</h2>
        <Field label="Subjects"><Input name="subjects" placeholder="Algebra 2, SAT math" /></Field>
        <Field label="Goals, or anything we should know"><Textarea name="goals" rows={3} /></Field>
      </section>
      <Checkbox name="consent" required label={`${schoolName} may contact me by email, text, or phone about lessons and billing.`} />
      <FormError>{state.error}</FormError>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Sending" : "Sign up"}</Button>
    </form>
  );
}
