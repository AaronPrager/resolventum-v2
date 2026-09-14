"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input, Select, Textarea } from "@/src/components/ui";
import { type ActionState, changePasswordAction, removeLogoAction, saveAgreementAction, saveTutorAction, updateOrganizationAction, uploadLogoAction } from "./actions";
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

export function TutorForm({ tutor }: { tutor?: { id: string; name: string; email: string; phone: string; color: string; hourlyPayRate: string; notes: string } }) {
  const [state, action, pending] = useActionState(saveTutorAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid={tutor ? `tutor-form-${tutor.id}` : "tutor-form-new"}>
      {tutor && <input type="hidden" name="tutorId" value={tutor.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="Name" className="col-span-2"><Input name="name" defaultValue={tutor?.name ?? ""} required /></Field>
        <Field label="Email"><Input type="email" name="email" defaultValue={tutor?.email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={tutor?.phone ?? ""} /></Field>
        <Field label="Calendar color"><Input type="color" name="color" defaultValue={tutor?.color || "#4f46e5"} className="h-9 p-1" /></Field>
        <Field label="Pay per hour"><Input type="text" inputMode="decimal" name="hourlyPayRate" defaultValue={tutor?.hourlyPayRate ?? ""} placeholder="45.00" /></Field>
        <Field label="Notes" className="col-span-full"><Input name="notes" defaultValue={tutor?.notes ?? ""} /></Field>
      </div>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      <Button type="submit" variant={tutor ? "secondary" : "primary"} disabled={pending}>{pending ? "Saving" : tutor ? "Save" : "Add tutor"}</Button>
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
