"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, FormOk, Input, Select, Textarea } from "@/src/components/ui";
import { type ActionState, enrollLeadAction, moveLeadAction, saveLeadAction } from "./actions";

export interface LeadValues { id?: string; studentFirstName: string; studentLastName: string; grade: string; schoolName: string; studentEmail: string; studentPhone: string; parentName: string; parentEmail: string; parentPhone: string; subjects: string; goals: string; source: string; notes: string }

export function LeadForm({ lead }: { lead?: LeadValues }) {
  const [state, action, pending] = useActionState(saveLeadAction, {} as ActionState);
  const [key, setKey] = useState(0);
  const v = lead ?? { studentFirstName: "", studentLastName: "", grade: "", schoolName: "", studentEmail: "", studentPhone: "", parentName: "", parentEmail: "", parentPhone: "", subjects: "", goals: "", source: "", notes: "" };
  return (
    <form key={key} action={async (fd) => { await action(fd); if (!lead) setKey((k) => k + 1); }} className="space-y-3" data-testid={lead ? `lead-form-${lead.id}` : "lead-form-new"}>
      {lead?.id && <input type="hidden" name="leadId" value={lead.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Student first name"><Input name="studentFirstName" defaultValue={v.studentFirstName} required /></Field>
        <Field label="Last name"><Input name="studentLastName" defaultValue={v.studentLastName} required /></Field>
        <Field label="Grade"><Input name="grade" defaultValue={v.grade} /></Field>
        <Field label="School"><Input name="schoolName" defaultValue={v.schoolName} /></Field>
        <Field label="Parent name" className="col-span-2"><Input name="parentName" defaultValue={v.parentName} required /></Field>
        <Field label="Parent email"><Input type="email" name="parentEmail" defaultValue={v.parentEmail} /></Field>
        <Field label="Parent phone"><Input name="parentPhone" defaultValue={v.parentPhone} /></Field>
        <Field label="Wants help with" className="col-span-2"><Input name="subjects" defaultValue={v.subjects} placeholder="Algebra II, SAT" /></Field>
        <Field label="How they found you"><Input name="source" defaultValue={v.source} placeholder="referral, Google, form" list="lead-sources" /><datalist id="lead-sources"><option value="referral" /><option value="Google" /><option value="form" /><option value="school" /><option value="social" /></datalist></Field>
        <Field label="Student email"><Input type="email" name="studentEmail" defaultValue={v.studentEmail} /></Field>
        <Field label="Goals" className="col-span-full"><Textarea name="goals" rows={2} defaultValue={v.goals} /></Field>
        <Field label="Notes" className="col-span-full"><Textarea name="notes" rows={2} defaultValue={v.notes} /></Field>
        <input type="hidden" name="studentPhone" value={v.studentPhone} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={lead ? "secondary" : "primary"} disabled={pending}>{pending ? "Saving" : lead ? "Save" : "Add lead"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}

/** Move a lead along: book a consult or trial (with a time), or mark it lost with a reason. */
export function MoveLeadForm({ leadId, status }: { leadId: string; status: string }) {
  const [state, action, pending] = useActionState(moveLeadAction, {} as ActionState);
  const [next, setNext] = useState(status === "INQUIRY" ? "CONSULT_BOOKED" : status === "CONSULT_BOOKED" ? "TRIAL" : "LOST");
  return (
    <form action={action} className="space-y-2" data-testid={`move-lead-${leadId}`}>
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Move to">
          <Select name="status" value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="INQUIRY">Inquiry</option>
            <option value="CONSULT_BOOKED">Consult booked</option>
            <option value="TRIAL">Trial lesson</option>
            <option value="LOST">Lost</option>
          </Select>
        </Field>
        {(next === "CONSULT_BOOKED" || next === "TRIAL") && (
          <>
            <Field label="Date"><Input type="date" name="consultDate" /></Field>
            <Field label="Time"><Input type="time" name="consultTime" defaultValue="16:00" /></Field>
          </>
        )}
        {next === "LOST" && <Field label="Why" className="min-w-56"><Input name="lostReason" placeholder="Too far, went with someone else, price" required /></Field>}
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Moving" : "Move"}</Button>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}

/** Enrol: the student and family account are made from the lead. */
export function EnrollForm({ leadId, accounts }: { leadId: string; accounts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(enrollLeadAction, {} as ActionState);
  return (
    <form action={action} className="space-y-2" data-testid={`enroll-${leadId}`}>
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Family account" hint="New, or an existing one for a sibling">
          <Select name="accountId" defaultValue="">
            <option value="">A new account for this family</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="New account name" hint="Empty uses the student's name"><Input name="accountName" placeholder="The Marquez family" /></Field>
        <Button type="submit" disabled={pending}>{pending ? "Enrolling" : "Enrol as a student"}</Button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
