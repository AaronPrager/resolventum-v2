import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { localDateStr } from "@/src/lib/tz";
import { studentChoices } from "@/src/services/students";
import { recentLessonChoices } from "@/src/services/sessionNotes";
import { Card, PageHeader } from "@/src/components/ui";
import { NoteForm } from "../NoteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New note" };

/** The one place a note starts. Reached with a student, a lesson, or nothing filled in. */
export default async function NewNotePage({ searchParams }: { searchParams: Promise<{ student?: string; lesson?: string; returnTo?: string }> }) {
  const q = await searchParams;
  const s = await requireSession();
  const returnTo = q.returnTo && q.returnTo.startsWith("/") && !q.returnTo.startsWith("//") ? q.returnTo : "/notes";
  if (q.lesson && q.student) {
    const existing = await prisma.sessionNote.findFirst({ where: { lessonId: q.lesson, studentId: q.student, organizationId: s.organizationId }, select: { id: true } });
    if (existing) redirect(`/notes/${existing.id}?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const scope = tutorScope(s);
  const [students, lessonsByStudent] = await Promise.all([
    studentChoices(prisma, s.organizationId, q.student ? [q.student] : []),
    recentLessonChoices(prisma, s.organizationId, { timeZone: s.timezone, tutorId: scope }),
  ]);
  const studentId = q.student && students.some((x) => x.id === q.student) ? q.student : "";
  const lessons = lessonsByStudent[studentId] ?? [];
  const lessonId = q.lesson && lessons.some((l) => l.id === q.lesson) ? q.lesson : lessons[0]?.id ?? "";
  return (
    <div className="space-y-6">
      <PageHeader title="New note" back={{ href: returnTo, label: "Back" }} subtitle="What was covered, a win, a struggle, homework, and the next goal. About one lesson, or general." />
      <Card>
        <NoteForm
          students={students.map((x) => ({ id: x.id, name: x.name, first: x.name.split(", ")[1] ?? x.name }))}
          lessonsByStudent={lessonsByStudent}
          defaults={{ studentId, lessonId }}
          today={localDateStr(new Date(), s.timezone)}
          returnTo={returnTo}
        />
      </Card>
    </div>
  );
}
