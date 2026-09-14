import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { emailConfigured } from "@/src/email/send";
import { feedStatus } from "@/src/services/calendarFeed";
import { Badge, Card, LinkButton, PageHeader } from "@/src/components/ui";
import { FeedCard } from "./FeedCard";
import { CopyLink } from "./CopyLink";
import { intakeAction } from "./actions";
import { Button } from "@/src/components/ui";
import { LogoForm, OrganizationForm, PasswordForm } from "./forms";

export const dynamic = "force-dynamic";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Jerusalem", "Asia/Tokyo", "Australia/Sydney"];

export default async function SettingsPage() {
  const session = await requireSession();
  const [org, m] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    prisma.membership.findFirstOrThrow({ where: { userId: session.userId, organizationId: session.organizationId }, select: { id: true } }),
  ]);
  const status = await feedStatus(prisma, m.id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"}`;
  const zones = ZONES.includes(org.timezone) ? ZONES : [org.timezone, ...ZONES];
  // v1 schools arrive with the switch on but no v2 link; that counts as off until the owner turns it on here.
  const intakeOn = org.studentIntakeEnabled && !!org.intakeCode;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={`${session.email} · ${session.role.toLowerCase()}`} actions={<><LinkButton href="/settings/team" variant="secondary">Team</LinkButton><LinkButton href="/settings/tutors" variant="secondary">Tutors</LinkButton><LinkButton href="/settings/agreement" variant="secondary">Agreement</LinkButton></>} />
      <Card title="Your school">
        <OrganizationForm canEdit={session.role === "OWNER"} zones={zones} org={{ name: org.name, timezone: org.timezone, legalName: org.legalName ?? "", address: org.address ?? "", phone: org.phone ?? "", replyToEmail: org.replyToEmail ?? "", venmoHandle: org.venmoHandle ?? "", zelleHandle: org.zelleHandle ?? "" }} />
      </Card>
      <Card title="Logo"><LogoForm logoUrl={org.logoFileId ? `/api/files/${org.logoFileId}` : null} canEdit={session.role === "OWNER"} /></Card>
      <Card title="Family sign-up link">
        <div className="space-y-3 text-sm" data-testid="intake-card">
          <p className="text-muted">Share this link on your website or in a text. A family fills in the student, the parent, and what they want help with, and the student shows up in your list with a family account ready for lessons and payments.</p>
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
      <FeedCard enabled={status.enabled} since={status.since ? status.since.toISOString().slice(0, 10) : null} origin={origin} />
      <Card title="Password"><PasswordForm /></Card>
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
