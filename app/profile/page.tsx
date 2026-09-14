import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { feedStatus } from "@/src/services/calendarFeed";
import { Avatar, Badge, Card, PageHeader } from "@/src/components/ui";
import { FeedCard } from "../settings/FeedCard";
import { PasswordForm } from "../settings/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

/** What is personal to the signed-in person: who they are, their password, their calendar feed. The school's settings live under Office. */
export default async function ProfilePage() {
  const session = await requireSession();
  const m = await prisma.membership.findFirstOrThrow({ where: { userId: session.userId, organizationId: session.organizationId }, select: { id: true, tutor: { select: { name: true, timezone: true, subjects: true, availability: true } } } });
  const status = await feedStatus(prisma, m.id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"}`;
  const who = session.name || session.email;
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your sign-in, your password, and your calendar feed. The school's settings are under Office." />
      <Card title="You">
        <div className="flex items-center gap-3 text-sm">
          <Avatar name={who} className="size-10 text-sm" />
          <div>
            <div className="font-medium">{who}</div>
            <div className="text-muted">{session.email} · <Badge tone={session.role === "OWNER" ? "brand" : "neutral"}>{session.role.toLowerCase()}</Badge> at {session.organizationName}</div>
            {m.tutor && <div className="mt-1 text-muted">Teaching as {m.tutor.name}{m.tutor.timezone && ` · times shown in ${m.tutor.timezone}`}{m.tutor.subjects.length > 0 && ` · ${m.tutor.subjects.join(", ")}`}{m.tutor.availability && ` · ${m.tutor.availability}`}</div>}
          </div>
        </div>
        {session.role === "TUTOR" && <p className="mt-3 text-xs text-muted">Your subjects, hours, and pay are set by the owner under Office, Tutors.</p>}
      </Card>
      <Card title="Password"><PasswordForm /></Card>
      <FeedCard enabled={status.enabled} since={status.since ? status.since.toISOString().slice(0, 10) : null} origin={origin} />
    </div>
  );
}
