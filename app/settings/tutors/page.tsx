import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { Badge, Button, Card, Empty, PageHeader } from "@/src/components/ui";
import { archiveTutorAction } from "../actions";
import { TutorForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function TutorsPage() {
  const s = await requireSession();
  const tutors = await prisma.tutor.findMany({ where: { organizationId: s.organizationId }, orderBy: [{ archivedAt: "asc" }, { name: "asc" }], include: { _count: { select: { lessons: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Tutors" back={{ href: "/settings", label: "Settings" }} subtitle="People who teach. A pay rate turns the tutor report into a payroll figure. Tutors do not sign in yet." />
      {s.role === "OWNER" && <Card title="Add a tutor"><TutorForm /></Card>}
      {tutors.length === 0 ? <Empty>No tutors yet.</Empty> : tutors.map((t) => (
        <Card key={t.id} title={<span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color ?? "var(--brand)" }} />{t.name}{t.archivedAt && <Badge>archived</Badge>}<span className="text-xs font-normal text-muted">{t._count.lessons} lessons{t.hourlyPayRateCents != null && ` · ${formatCents(t.hourlyPayRateCents)} per hour`}</span></span>}
          actions={s.role === "OWNER" && <form action={archiveTutorAction}><input type="hidden" name="tutorId" value={t.id} /><Button variant="link" className="text-xs">{t.archivedAt ? "Restore" : "Archive"}</Button></form>}>
          {s.role === "OWNER" ? <TutorForm tutor={{ id: t.id, name: t.name, email: t.email ?? "", phone: t.phone ?? "", color: t.color ?? "", hourlyPayRate: t.hourlyPayRateCents != null ? (t.hourlyPayRateCents / 100).toFixed(2) : "", notes: t.notes ?? "" }} /> : <p className="text-sm text-muted">{t.email}{t.phone && ` · ${t.phone}`}</p>}
        </Card>
      ))}
    </div>
  );
}
