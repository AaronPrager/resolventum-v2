import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { emailConfigured } from "@/src/email/send";
import { feedStatus } from "@/src/services/calendarFeed";
import { Badge, Card, LinkButton, PageHeader } from "@/src/components/ui";
import { FeedCard } from "./FeedCard";
import { OrganizationForm, PasswordForm } from "./forms";

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
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={`${session.email} · ${session.role.toLowerCase()}`} actions={<LinkButton href="/settings/tutors" variant="secondary">Tutors</LinkButton>} />
      <Card title="Your school">
        <OrganizationForm canEdit={session.role === "OWNER"} zones={zones} org={{ name: org.name, timezone: org.timezone, legalName: org.legalName ?? "", address: org.address ?? "", phone: org.phone ?? "", replyToEmail: org.replyToEmail ?? "", venmoHandle: org.venmoHandle ?? "", zelleHandle: org.zelleHandle ?? "" }} />
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
