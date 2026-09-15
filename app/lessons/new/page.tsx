import { prisma } from "@/src/db";
import { studentChoices } from "@/src/services/students";
import { listLessonCategories } from "@/src/services/lessonCategories";
import { requireSession } from "@/src/auth/current";
import { LessonForm } from "../LessonForm";
import { createLessonAction } from "../actions";
import { Card, PageHeader } from "@/src/components/ui";

export const dynamic = "force-dynamic";

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<{ date?: string; time?: string; returnTo?: string; student?: string }> }) {
  const q = await searchParams;
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const [students, categories, tutors] = await Promise.all([
    studentChoices(prisma, org.id),
    listLessonCategories(prisma, org.id),
    prisma.tutor.findMany({ where: { organizationId: org.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, hourlyClientRateCents: true, subjects: true, availability: true } }),
  ]);
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : new Date().toISOString().slice(0, 10);
  const time = q.time && /^\d{2}:\d{2}$/.test(q.time) ? q.time : "16:00";
  return (
    <div className="space-y-6">
      <PageHeader title="New lesson" back={{ href: q.returnTo ?? "/calendar", label: "Back" }} />
      <Card>
        <LessonForm
          action={createLessonAction}
          students={students}
          tutors={tutors.map((t) => ({ id: t.id, name: t.name, clientRateCents: t.hourlyClientRateCents, subjects: t.subjects, availability: t.availability }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          submitLabel="Add lesson"
          allowRepeat
          returnTo={q.returnTo ?? "/calendar"}
          initial={{ date, time, durationMin: 60, subject: students.find((s) => s.id === q.student)?.defaultSubject ?? "", seats: [{ studentId: q.student && students.some((s) => s.id === q.student) ? q.student : "", price: students.find((s) => s.id === q.student)?.defaultPrice ?? "" }], tutorId: tutors.length === 1 ? tutors[0].id : "", locationType: "IN_PERSON", meetingLink: "", notes: "", categoryId: "" }}
        />
      </Card>
    </div>
  );
}
