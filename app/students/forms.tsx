"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, Input, Radio, Select, Textarea } from "@/src/components/ui";
import { type ActionState, createStudentAction, moveStudentAction, updateStudentAction } from "./actions";

export interface StudentValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  grade: string;
  schoolName: string;
  dateOfBirth: string;
  defaultSubject: string;
  defaultPrice: string;
  difficulties: string;
  notes: string;
  /** Edit only. */
  status?: "ACTIVE" | "PAUSED" | "GRADUATED";
}

const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "College", "Adult"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line pt-5 first-of-type:border-t-0 first-of-type:pt-0 md:grid-cols-[14rem_1fr]">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
  );
}

/** New student (with the family section) or edit (without it). */
export function StudentForm({ studentId, initial, accounts }: { studentId?: string; initial: StudentValues; accounts?: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(studentId ? updateStudentAction : createStudentAction, {} as ActionState);
  const [family, setFamily] = useState<"new" | "existing">("new");
  return (
    <form action={action} className="space-y-5" data-testid="student-form">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      <Section title="Student">
        <Field label="First name" className="col-span-1 sm:col-span-2"><Input name="firstName" defaultValue={initial.firstName} required autoFocus={!studentId} /></Field>
        <Field label="Last name" className="col-span-1 sm:col-span-2"><Input name="lastName" defaultValue={initial.lastName} required /></Field>
        <Field label="Grade">
          <Input name="grade" defaultValue={initial.grade} list="grades" />
          <datalist id="grades">{GRADES.map((g) => <option key={g} value={g} />)}</datalist>
        </Field>
        <Field label="School" className="col-span-1 sm:col-span-2"><Input name="schoolName" defaultValue={initial.schoolName} /></Field>
        <Field label="Date of birth"><Input type="date" name="dateOfBirth" defaultValue={initial.dateOfBirth} /></Field>
        <Field label="Student email" className="col-span-1 sm:col-span-2" hint="For homework links"><Input type="email" name="email" defaultValue={initial.email} /></Field>
        <Field label="Student phone" className="col-span-1 sm:col-span-2"><Input name="phone" defaultValue={initial.phone} /></Field>
        {studentId && (
          <Field label="Status" className="col-span-2" hint="Paused or graduated: their scheduled lessons are cancelled, a weekly series that was only theirs ends, and they leave the lesson pickers. They stay on the list. Archive to hide them too.">
            <Select name="status" defaultValue={initial.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused (taking a break)</option>
              <option value="GRADUATED">Graduated (finished)</option>
            </Select>
          </Field>
        )}
      </Section>

      <Section title="Lessons" hint="Filled in for you each time you add a lesson.">
        <Field label="Usual subject" className="col-span-2 sm:col-span-3"><Input name="defaultSubject" defaultValue={initial.defaultSubject} placeholder="Algebra 2, SAT math" /></Field>
        <Field label="Usual price"><Input name="defaultPrice" inputMode="decimal" defaultValue={initial.defaultPrice} placeholder="130.00" /></Field>
      </Section>

      {accounts && (
        <Section title="Family" hint="Siblings share one account, so one statement and one balance.">
          <div className="col-span-full flex flex-wrap gap-5">
            <Radio name="family" value="new" checked={family === "new"} onChange={() => setFamily("new")} label="New family account" />
            <Radio name="family" value="existing" checked={family === "existing"} onChange={() => setFamily("existing")} label="Add to an existing family" disabled={accounts.length === 0} />
          </div>
          {family === "new" ? (
            <>
              <Field label="Account name" className="col-span-2" hint="Leave empty to use the student's name"><Input name="accountName" placeholder="The Smith family" /></Field>
              <Field label="Parent name" className="col-span-2"><Input name="guardianName" /></Field>
              <Field label="Parent email" className="col-span-2" hint="Statements go here"><Input type="email" name="guardianEmail" /></Field>
              <Field label="Parent phone" className="col-span-2"><Input name="guardianPhone" /></Field>
            </>
          ) : (
            <Field label="Family account" className="col-span-full sm:col-span-2">
              <Select name="accountId" defaultValue="" required>
                <option value="" disabled>Pick an account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
        </Section>
      )}

      <Section title="Notes" hint="Only you see these.">
        <Field label="What they find hard" className="col-span-full"><Textarea name="difficulties" rows={2} defaultValue={initial.difficulties} /></Field>
        <Field label="Other notes" className="col-span-full"><Textarea name="notes" rows={3} defaultValue={initial.notes} /></Field>
      </Section>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : studentId ? "Save changes" : "Add student"}</Button>
        <FormError>{state.error}</FormError>
      </div>
    </form>
  );
}

/** Move to another family account, or split off onto a new one. */
export function MoveStudentForm({ studentId, currentAccountName, accounts, alone }: { studentId: string; currentAccountName: string; accounts: { id: string; name: string }[]; alone: boolean }) {
  const [state, action, pending] = useActionState(moveStudentAction, {} as ActionState);
  const [target, setTarget] = useState("");
  return (
    <form action={action} className="space-y-3" data-testid="move-form">
      <input type="hidden" name="studentId" value={studentId} />
      <p className="text-sm text-muted">
        Now on <span className="font-medium text-fg">{currentAccountName}</span>.{" "}
        {alone
          ? "They are the only student on it, so the whole account moves with them: charges, payments, and contacts. The empty account is archived."
          : "Other students share it. Past charges and all payments stay with that family; this student's upcoming charges move."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Move to">
          <Select name="target" value={target} onChange={(e) => setTarget(e.target.value)} required>
            <option value="" disabled>Pick an account</option>
            {!alone && <option value="new">A new account of their own</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        {target === "new" && <Field label="New account name"><Input name="newAccountName" placeholder="Leave empty for the student's name" /></Field>}
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" variant="secondary" disabled={pending || !target}>{pending ? "Moving" : "Move student"}</Button>
    </form>
  );
}

