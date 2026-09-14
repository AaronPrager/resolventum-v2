import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { describeTutorPay } from "@/src/services/payroll";
import { describeAvailability, parseAvailability } from "@/src/lib/availability";
import { PageHeader } from "@/src/components/ui";
import { TutorCards } from "./TutorCards";

export const dynamic = "force-dynamic";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Jerusalem", "Asia/Tokyo", "Australia/Sydney"];

export default async function TutorsPage() {
  const s = await requireSession();
  const tutors = await prisma.tutor.findMany({ where: { organizationId: s.organizationId }, orderBy: [{ archivedAt: "asc" }, { name: "asc" }], include: { _count: { select: { lessons: true } }, payRates: { orderBy: { subject: "asc" } }, membership: { select: { user: { select: { email: true } } } } } });
  const cents = (c: number | null) => (c != null ? (c / 100).toFixed(2) : "");
  const hours = (a: string | null) => { try { const w = parseAvailability(a); return w ? describeAvailability(w) : null; } catch { return a; } };
  return (
    <div className="space-y-6">
      <PageHeader title="Tutors" back={{ href: "/settings", label: "Office" }} subtitle="People who teach. Subjects, what families pay, and what the tutor is paid: per hour, a percent of the lesson, or a rule per subject. To let a tutor sign in, invite them under Team and link the login there." />
      <TutorCards
        owner={s.role === "OWNER"}
        zones={[...new Set([...tutors.map((t) => t.timezone).filter((z): z is string => !!z), ...ZONES])]}
        tutors={tutors.map((t) => ({
          values: { id: t.id, name: t.name, email: t.email ?? "", phone: t.phone ?? "", color: t.color ?? "", subjects: t.subjects.join(", "), hourlyClientRate: cents(t.hourlyClientRateCents), hourlyPayRate: cents(t.hourlyPayRateCents), payPercent: t.payPercent != null ? String(t.payPercent) : "", availability: t.availability ?? "", timezone: t.timezone ?? "", notes: t.notes ?? "", payRates: t.payRates.map((r) => ({ subject: r.subject, hourly: cents(r.hourlyPayRateCents), percent: r.payPercent != null ? String(r.payPercent) : "" })) },
          lessons: t._count.lessons,
          archived: !!t.archivedAt,
          signsIn: !!t.membership,
          pay: describeTutorPay(t),
          clientRate: t.hourlyClientRateCents != null ? formatCents(t.hourlyClientRateCents) : null,
          hours: hours(t.availability),
        }))}
      />
    </div>
  );
}
