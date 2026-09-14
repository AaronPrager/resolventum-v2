import { prisma } from "@/src/db";
import { requireWriter } from "@/src/auth/current";
import { Card, PageHeader } from "@/src/components/ui";
import { StudentForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const session = await requireWriter();
  const accounts = await prisma.account.findMany({ where: { organizationId: session.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="space-y-6">
      <PageHeader title="Add student" back={{ href: "/students", label: "Students" }} />
      <Card>
        <StudentForm
          accounts={accounts}
          initial={{ firstName: "", lastName: "", email: "", phone: "", grade: "", schoolName: "", dateOfBirth: "", defaultSubject: "", defaultPrice: "", difficulties: "", notes: "" }}
        />
      </Card>
    </div>
  );
}
