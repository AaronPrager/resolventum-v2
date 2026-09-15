"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { AddRow, Button, Checkbox, Field, FormError, FormOk, IconButton, Input, Row, RowActions, Rows, Select, Textarea } from "@/src/components/ui";
import { type ActionState, changePasswordAction, removeLogoAction, saveAgreementAction, saveAlertsAction, savePolicyAction, saveTutorAction, updateOrganizationAction, uploadLogoAction } from "./actions";
import { FileInput } from "@/src/components/FileInput";

export function OrganizationForm({ org, zones, canEdit }: { org: { name: string; timezone: string; legalName: string; address: string; phone: string; replyToEmail: string; venmoHandle: string; zelleHandle: string }; zones: string[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateOrganizationAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="org-form">
      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name shown to families" className="col-span-2"><Input name="name" defaultValue={org.name} required /></Field>
        <Field label="Legal name" className="col-span-2"><Input name="legalName" defaultValue={org.legalName} /></Field>
        <Field label="Timezone" className="col-span-2"><Select name="timezone" defaultValue={org.timezone}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
        <Field label="Phone"><Input name="phone" defaultValue={org.phone} /></Field>
        <Field label="Reply-to email" hint="Families reply here"><Input type="email" name="replyToEmail" defaultValue={org.replyToEmail} /></Field>
        <Field label="Address" className="col-span-2"><Textarea name="address" rows={2} defaultValue={org.address} /></Field>
        <Field label="Venmo"><Input name="venmoHandle" defaultValue={org.venmoHandle} placeholder="@handle" /></Field>
        <Field label="Zelle"><Input name="zelleHandle" defaultValue={org.zelleHandle} placeholder="email or phone" /></Field>
      </fieldset>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      {canEdit ? <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save"}</Button> : <p className="text-xs text-muted">Only the owner can change these.</p>}
    </form>
  );
}

export interface PayRateRow { subject: string; hourly: string; percent: string }
export interface TutorValues { id: string; name: string; email: string; phone: string; color: string; subjects: string; hourlyClientRate: string; hourlyPayRate: string; payPercent: string; availability: string; timezone: string; notes: string; payRates: PayRateRow[] }

export function TutorForm({ tutor, zones, onDone }: { tutor?: TutorValues; zones: string[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await saveTutorAction(prev, fd);
    if (r.ok) onDone?.();
    return r;
  }, {} as ActionState);
  const [rates, setRates] = useState<PayRateRow[]>(tutor?.payRates ?? []);
  return (
    <form action={action} className="space-y-4" data-testid={tutor ? `tutor-form-${tutor.id}` : "tutor-form-new"}>
      {tutor && <input type="hidden" name="tutorId" value={tutor.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="Name" className="col-span-2"><Input name="name" defaultValue={tutor?.name ?? ""} required /></Field>
        <Field label="Email"><Input type="email" name="email" defaultValue={tutor?.email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={tutor?.phone ?? ""} /></Field>
        <Field label="Calendar color"><Input type="color" name="color" defaultValue={tutor?.color || "#0e5c48"} className="h-9 p-1" /></Field>
        <Field label="Timezone" hint="If not the school's"><Select name="timezone" defaultValue={tutor?.timezone ?? ""}><option value="">School&apos;s</option>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
        <Field label="Subjects" className="col-span-2 sm:col-span-3" hint="Comma separated"><Input name="subjects" defaultValue={tutor?.subjects ?? ""} placeholder="Algebra, SAT Math, Chemistry" /></Field>
        <Field label="Availability" className="col-span-2 sm:col-span-3" hint="Days and hours, like Mon-Thu 16:00-20:00, Sat 9:00-13:00. The lesson form warns when a time falls outside."><Input name="availability" defaultValue={tutor?.availability ?? ""} placeholder="Mon-Thu 16:00-20:00, Sat 9:00-13:00" /></Field>
        <Field label="Client rate per hour" hint="What families pay"><Input type="text" inputMode="decimal" name="hourlyClientRate" defaultValue={tutor?.hourlyClientRate ?? ""} placeholder="90.00" /></Field>
        <Field label="Pay per hour"><Input type="text" inputMode="decimal" name="hourlyPayRate" defaultValue={tutor?.hourlyPayRate ?? ""} placeholder="45.00" /></Field>
        <Field label="Or pay percent" hint="Of the lesson price; wins over hourly"><Input type="text" inputMode="numeric" name="payPercent" defaultValue={tutor?.payPercent ?? ""} placeholder="50" /></Field>
        <Field label="Notes" className="col-span-full"><Input name="notes" defaultValue={tutor?.notes ?? ""} /></Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-fg/80">Pay by subject</legend>
        <p className="text-xs text-muted">A different rule for one subject, matched on the lesson&apos;s subject. Fill in per hour or a percent; percent wins. Empty means every subject pays the same.</p>
        {rates.length > 0 && (
          <Rows className="sm:max-w-2xl">
            {rates.map((r, i) => (
              <Row key={i} className="hover:bg-surface">
                <div className="grid flex-1 grid-cols-[minmax(0,1fr)_6.5rem_5rem] items-center gap-2">
                  <Input name="rateSubject" aria-label={`Subject ${i + 1}`} value={r.subject} onChange={(e) => setRates((rows) => rows.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} placeholder="SAT Math" className="h-8" />
                  <Input name="rateHourly" aria-label={`Pay per hour ${i + 1}`} inputMode="decimal" value={r.hourly} onChange={(e) => setRates((rows) => rows.map((x, j) => (j === i ? { ...x, hourly: e.target.value } : x)))} placeholder="per hour" className="h-8" />
                  <Input name="ratePercent" aria-label={`Percent ${i + 1}`} inputMode="numeric" value={r.percent} onChange={(e) => setRates((rows) => rows.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} placeholder="%" className="h-8" />
                </div>
                <RowActions className="sm:opacity-100">
                  <IconButton tone="danger" label={`Remove rule ${i + 1}`} onClick={() => setRates((rows) => rows.filter((_, j) => j !== i))}><Trash2 aria-hidden /></IconButton>
                </RowActions>
              </Row>
            ))}
          </Rows>
        )}
        <AddRow className="sm:max-w-2xl">
          <Button type="button" variant="ghost" className="h-8" onClick={() => setRates((rows) => [...rows, { subject: "", hourly: "", percent: "" }])}>Add a subject rule</Button>
        </AddRow>
      </fieldset>
      <FormError>{state.error}</FormError>{!onDone && <FormOk>{state.ok}</FormOk>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving" : tutor ? "Save" : "Add tutor"}</Button>
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
      </div>
    </form>
  );
}

export function PolicyForm({ policy, canEdit }: { policy: { lateCancelHours: number; lateCancelChargePercent: number; noShowChargePercent: number; makeupOnLateCancel: boolean }; canEdit: boolean }) {
  const [state, action, pending] = useActionState(savePolicyAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="policy-form">
      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Late means under (hours)" hint="Before the lesson starts"><Input type="number" name="lateCancelHours" min={0} max={168} defaultValue={policy.lateCancelHours} required /></Field>
        <Field label="Late cancellation charged (%)" hint="0 waives it, 100 charges the whole lesson"><Input type="number" name="lateCancelChargePercent" min={0} max={100} defaultValue={policy.lateCancelChargePercent} required /></Field>
        <Field label="No-show charged (%)"><Input type="number" name="noShowChargePercent" min={0} max={100} defaultValue={policy.noShowChargePercent} required /></Field>
        <div className="col-span-full"><Checkbox name="makeupOnLateCancel" defaultChecked={policy.makeupOnLateCancel} label="When a late cancellation is charged, give a make-up credit automatically" /></div>
      </fieldset>
      <p className="text-xs text-muted">Applied when a lesson is cancelled or marked no-show. An early cancellation is never charged. Whoever cancels can still override it on the lesson.</p>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      {canEdit && <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save policy"}</Button>}
    </form>
  );
}


export function AlertsForm({ lowBalanceAlert, sessionNotesAuto, canEdit }: { lowBalanceAlert: string; sessionNotesAuto: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveAlertsAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="alerts-form">
      <fieldset disabled={!canEdit} className="space-y-3">
        <Field label="Email me when a family owes at least" className="max-w-xs" hint="Once a day, from the morning job. Empty turns it off."><Input inputMode="decimal" name="lowBalanceAlert" defaultValue={lowBalanceAlert} placeholder="300.00" /></Field>
        <Checkbox name="sessionNotesAuto" defaultChecked={sessionNotesAuto} label="Every night, email families the session notes written that day that were not sent by hand" />
      </fieldset>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      {canEdit && <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Save"}</Button>}
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="password-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Current password"><Input type="password" name="current" autoComplete="current-password" required /></Field>
        <Field label="New password"><Input type="password" name="next" autoComplete="new-password" minLength={10} required /></Field>
        <Field label="New password again"><Input type="password" name="confirm" autoComplete="new-password" minLength={10} required /></Field>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving" : "Change password"}</Button>
    </form>
  );
}

export function LogoForm({ logoUrl, canEdit }: { logoUrl: string | null; canEdit: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, {} as ActionState);
  return (
    <div className="flex flex-wrap items-start gap-5" data-testid="logo-card">
      <div className="flex h-20 w-48 items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-2 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="School logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">No logo</span>}
      </div>
      {canEdit ? (
        <div className="min-w-0 flex-1 space-y-2">
          <form action={action} className="flex flex-wrap items-center gap-2">
            <FileInput name="logo" accept="image/png,image/jpeg" aria-label="Logo image" className="w-auto" maxBytes={2 * 1024 * 1024} required />
            <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Uploading" : logoUrl ? "Replace" : "Upload"}</Button>
          </form>
          {logoUrl && <form action={removeLogoAction}><Button variant="link" className="text-xs text-owed">Remove logo</Button></form>}
          <p className="text-xs text-muted">PNG or JPEG, under 2 MB. A wide logo on a transparent background looks best.</p>
          <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
        </div>
      ) : <p className="text-sm text-muted">Only the owner can change the logo.</p>}
    </div>
  );
}

export function AgreementForm({ template, canEdit }: { template: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveAgreementAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="agreement-form">
      <Textarea name="template" rows={18} defaultValue={template} readOnly={!canEdit} className="font-mono text-[13px] leading-relaxed" aria-label="Agreement text" />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save"}</Button>
          <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
        </div>
      )}
    </form>
  );
}


