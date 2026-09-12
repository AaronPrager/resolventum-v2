import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { LessonForm } from "../LessonForm";
import { createLessonAction } from "../actions";
import { Card, PageHeader } from "@/src/components/ui";

export const dynamic = "force-dynamic";

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<{ date?: string; time?: string; returnTo?: string }> }) {
  const q = await searchParams;
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const [students, tutors] = await Promise.all([
    prisma.student.findMany({ where: { organizationId: org.id, deletedAt: null, archivedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.tutor.findMany({ where: { organizationId: org.id, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : new Date().toISOString().slice(0, 10);
  const time = q.time && /^\d{2}:\d{2}$/.test(q.time) ? q.time : "16:00";
  return (
    <div className="space-y-6">
      <PageHeader title="New lesson" back={{ href: q.returnTo ?? "/calendar", label: "Back" }} />
      <Card>
        <LessonForm
          action={createLessonAction}
          students={students.map((s) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}` }))}
          tutors={tutors}
          submitLabel="Add lesson"
          allowRepeat
          returnTo={q.returnTo ?? "/calendar"}
          initial={{ date, time, durationMin: 60, subject: "", price: "", tutorId: tutors.length === 1 ? tutors[0].id : "", locationType: "IN_PERSON", meetingLink: "", notes: "", category: "" }}
        />
      </Card>
    </div>
  );
}
