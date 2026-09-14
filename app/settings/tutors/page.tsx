import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { describeTutorPay } from "@/src/services/payroll";
import { Badge, Button, Card, Empty, PageHeader } from "@/src/components/ui";
import { archiveTutorAction } from "../actions";
import { TutorForm } from "../forms";

export const dynamic = "force-dynamic";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Jerusalem", "Asia/Tokyo", "Australia/Sydney"];

export default async function TutorsPage() {
  const s = await requireSession();
  const tutors = await prisma.tutor.findMany({ where: { organizationId: s.organizationId }, orderBy: [{ archivedAt: "asc" }, { name: "asc" }], include: { _count: { select: { lessons: true } }, payRates: { orderBy: { subject: "asc" } }, membership: { select: { user: { select: { email: true } } } } } });
  const zones = (extra?: string | null) => (extra && !ZONES.includes(extra) ? [extra, ...ZONES] : ZONES);
  const cents = (c: number | null) => (c != null ? (c / 100).toFixed(2) : "");
  return (
    <div className="space-y-6">
      <PageHeader title="Tutors" back={{ href: "/settings", label: "Settings" }} subtitle="People who teach. Subjects, what families pay, and what the tutor is paid: per hour, a percent of the lesson, or a rule per subject. To let a tutor sign in, invite them under Team and link the login here." />
      {s.role === "OWNER" && <Card title="Add a tutor"><TutorForm zones={ZONES} /></Card>}
      {tutors.length === 0 ? <Empty>No tutors yet.</Empty> : tutors.map((t) => (
        <Card key={t.id} title={<span className="inline-flex flex-wrap items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color ?? "var(--brand)" }} />{t.name}{t.archivedAt && <Badge>archived</Badge>}{t.membership && <Badge tone="brand">signs in</Badge>}<span className="text-xs font-normal text-muted">{t._count.lessons} lessons · pay {describeTutorPay(t)}{t.hourlyClientRateCents != null && ` · families pay ${formatCents(t.hourlyClientRateCents)} per hour`}{t.subjects.length > 0 && ` · ${t.subjects.join(", ")}`}</span></span>}
          actions={s.role === "OWNER" && <form action={archiveTutorAction}><input type="hidden" name="tutorId" value={t.id} /><Button variant="link" className="text-xs">{t.archivedAt ? "Restore" : "Archive"}</Button></form>}>
          {s.role === "OWNER" ? (
            <TutorForm zones={zones(t.timezone)} tutor={{ id: t.id, name: t.name, email: t.email ?? "", phone: t.phone ?? "", color: t.color ?? "", subjects: t.subjects.join(", "), hourlyClientRate: cents(t.hourlyClientRateCents), hourlyPayRate: cents(t.hourlyPayRateCents), payPercent: t.payPercent != null ? String(t.payPercent) : "", availability: t.availability ?? "", timezone: t.timezone ?? "", notes: t.notes ?? "", payRates: t.payRates.map((r) => ({ subject: r.subject, hourly: cents(r.hourlyPayRateCents), percent: r.payPercent != null ? String(r.payPercent) : "" })) }} />
          ) : (
            <p className="text-sm text-muted">{[t.email, t.phone, t.availability].filter(Boolean).join(" · ")}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
