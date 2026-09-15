import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { studentState } from "@/src/services/students";
import { requireWriter } from "@/src/auth/current";
import { Card, PageHeader } from "@/src/components/ui";
import { MoveStudentForm, StudentForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireWriter();
  const { id } = await params;
  const s = await prisma.student.findFirst({
    where: { id, organizationId: session.organizationId, deletedAt: null },
    include: { account: { include: { _count: { select: { students: { where: { deletedAt: null } } } } } } },
  });
  if (!s) notFound();
  const accounts = await prisma.account.findMany({
    where: { organizationId: session.organizationId, archivedAt: null, id: { not: s.accountId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${s.firstName} ${s.lastName}`} back={{ href: `/students/${s.id}`, label: `${s.firstName} ${s.lastName}` }} />
      <Card>
        <StudentForm
          studentId={s.id}
          initial={{
            firstName: s.firstName, lastName: s.lastName, email: s.email ?? "", phone: s.phone ?? "", grade: s.grade ?? "", schoolName: s.schoolName ?? "",
            dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString().slice(0, 10) : "", defaultSubject: s.defaultSubject ?? "",
            defaultPrice: s.defaultPriceCents != null ? (s.defaultPriceCents / 100).toFixed(2) : "", difficulties: s.difficulties ?? "", notes: s.notes ?? "", state: studentState(s),
          }}
        />
      </Card>
      <Card title="Family account">
        <MoveStudentForm studentId={s.id} currentAccountName={s.account.name} accounts={accounts} alone={s.account._count.students === 1} />
      </Card>
    </div>
  );
}
