import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { emailConfigured } from "@/src/email/send";
import { Badge, Card, LinkButton, PageHeader } from "@/src/components/ui";
import { CopyLink } from "./CopyLink";
import { intakeAction } from "./actions";
import { Button } from "@/src/components/ui";
import { AlertsForm, HolidayForm, LogoForm, OrganizationForm, PolicyForm } from "./forms";
import { listHolidays } from "@/src/services/holidays";
import { EXPORT_KINDS } from "@/src/services/exportData";
import { formatDate } from "@/src/lib/format";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { removeHolidayAction } from "./actions";

export const dynamic = "force-dynamic";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Jerusalem", "Asia/Tokyo", "Australia/Sydney"];

export default async function SettingsPage() {
  const session = await requireSession();
  const [org, holidays] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    listHolidays(prisma, session.organizationId),
  ]);
  const owner = session.role === "OWNER";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"}`;
  const zones = ZONES.includes(org.timezone) ? ZONES : [org.timezone, ...ZONES];
  // v1 schools arrive with the switch on but no v2 link; that counts as off until the owner turns it on here.
  const intakeOn = org.studentIntakeEnabled && !!org.intakeCode;
  return (
    <div className="space-y-6">
      <PageHeader title="Office" subtitle="How the school runs: its name and details, the cancellation policy, holidays, alerts, the sign-up link, and your data. Your own password and calendar feed are under Profile." actions={<><LinkButton href="/settings/tutors" variant="secondary">Tutors</LinkButton><LinkButton href="/settings/team" variant="secondary">Team</LinkButton><LinkButton href="/settings/agreement" variant="secondary">Agreement</LinkButton><LinkButton href="/settings/audit" variant="secondary">Audit</LinkButton></>} />
      <Card title="Your school">
        <OrganizationForm canEdit={session.role === "OWNER"} zones={zones} org={{ name: org.name, timezone: org.timezone, legalName: org.legalName ?? "", address: org.address ?? "", phone: org.phone ?? "", replyToEmail: org.replyToEmail ?? "", venmoHandle: org.venmoHandle ?? "", zelleHandle: org.zelleHandle ?? "" }} />
      </Card>
      <Card title="Logo"><LogoForm logoUrl={org.logoFileId ? `/api/files/${org.logoFileId}` : null} canEdit={session.role === "OWNER"} /></Card>
      <Card title="Cancellation policy">
        <PolicyForm canEdit={owner} policy={{ lateCancelHours: org.lateCancelHours, lateCancelChargePercent: org.lateCancelChargePercent, noShowChargePercent: org.noShowChargePercent, makeupOnLateCancel: org.makeupOnLateCancel }} />
      </Card>
      <Card title="School holidays">
        <div className="space-y-4" data-testid="holidays-card">
          <p className="text-sm text-muted">A weekly series marked &quot;term time only&quot; makes no lessons on these days.</p>
          {holidays.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line text-sm" data-testid="holidays">
              {holidays.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted tabular-nums">{formatDate(h.startsOn)}{h.endsOn.getTime() !== h.startsOn.getTime() && ` to ${formatDate(h.endsOn)}`}</span>
                  {owner && (
                    <ConfirmForm action={removeHolidayAction} className="ml-auto" message={`Remove ${h.name}?`}>
                      <input type="hidden" name="holidayId" value={h.id} />
                      <Button variant="ghost" className="text-xs text-owed">Remove</Button>
                    </ConfirmForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {owner && <HolidayForm />}
        </div>
      </Card>
      <Card title="Alerts and automatic emails">
        <AlertsForm canEdit={owner} lowBalanceAlert={org.lowBalanceAlertCents != null ? (org.lowBalanceAlertCents / 100).toFixed(2) : ""} sessionNotesAuto={org.sessionNotesAuto} />
        <p className="mt-3 text-xs text-muted">Lesson reminders and the daily schedule are on the <a href="/emails?tab=schedule" className="text-brand hover:underline">Emails</a> page. Each family can be opted out of reminders and notes on their account page.</p>
      </Card>
      <Card title="Family sign-up link">
        <div className="space-y-3 text-sm" data-testid="intake-card">
          <p className="text-muted">Share this link on your website or in a text. A family fills in the student, the parent, and what they want help with, and an inquiry lands in <a href="/leads" className="text-brand hover:underline">Leads</a>, ready to book a consult or enroll.</p>
          {intakeOn ? <CopyLink url={`${origin}/join/${org.intakeCode}`} testId="intake-link" /> : <p>Off.</p>}
          {session.role === "OWNER" && (
            <div className="flex flex-wrap gap-2">
              {intakeOn ? (
                <>
                  <form action={intakeAction}><input type="hidden" name="what" value="regenerate" /><Button variant="secondary">New link</Button></form>
                  <form action={intakeAction}><input type="hidden" name="what" value="off" /><Button variant="secondary">Turn off</Button></form>
                </>
              ) : (
                <form action={intakeAction}><input type="hidden" name="what" value="on" /><Button>Turn on</Button></form>
              )}
            </div>
          )}
          {intakeOn && <p className="text-xs text-muted">A new link stops the old one from working.</p>}
        </div>
      </Card>
      <Card title="Your data">
        <p className="mb-3 text-sm text-muted">Every table as a spreadsheet, or everything at once. Yours to take whenever you like.</p>
        <div className="flex flex-wrap gap-2" data-testid="exports">
          <a href="/api/export?what=all" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-fg shadow-xs hover:bg-brand-strong">Everything (ZIP)</a>
          {EXPORT_KINDS.map((k) => <a key={k} href={`/api/export?what=${k}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-surface-2">{k === "notes" ? "session notes" : k}</a>)}
        </div>
      </Card>
      <Card title="Server features">
        <div className="flex flex-wrap gap-3 text-sm">
          <span>Email <Badge tone={emailConfigured() ? "credit" : "warn"}>{emailConfigured() ? "on" : "off"}</Badge></span>
          <span>AI <Badge tone={aiConfigured() ? "credit" : "warn"}>{aiConfigured() ? "on" : "off"}</Badge></span>
        </div>
        <p className="mt-2 text-xs text-muted">Email needs RESEND_API_KEY and EMAIL_FROM. AI needs GEMINI_API_KEY. Both are set on the server, not here.</p>
      </Card>
    </div>
  );
}
