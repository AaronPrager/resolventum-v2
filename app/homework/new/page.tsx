import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { listLibrary } from "@/src/services/files";
import { recentLessonChoices } from "@/src/services/sessionNotes";
import { Card, PageHeader } from "@/src/components/ui";
import { NewAssignmentForm } from "../NewAssignmentForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New assignment" };

/** The one place homework is set. Reached with a student filled in, or not. */
export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ student?: string; lesson?: string; returnTo?: string }> }) {
  const q = await searchParams;
  const s = await requireSession();
  const returnTo = q.returnTo && q.returnTo.startsWith("/") && !q.returnTo.startsWith("//") ? q.returnTo : "/homework";
  const [students, library, lessonsByStudent] = await Promise.all([
    prisma.student.findMany({ where: { organizationId: s.organizationId, deletedAt: null, archivedAt: null, OR: [{ status: "ACTIVE" }, { id: q.student ?? "" }] }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    listLibrary(prisma, s.organizationId),
    recentLessonChoices(prisma, s.organizationId, { timeZone: s.timezone, tutorId: tutorScope(s) }),
  ]);
  const studentId = q.student && students.some((x) => x.id === q.student) ? q.student : "";
  const lessonId = q.lesson && (lessonsByStudent[studentId] ?? []).some((l) => l.id === q.lesson) ? q.lesson : "";
  return (
    <div className="space-y-6">
      <PageHeader title="New assignment" back={{ href: returnTo, label: "Back" }} subtitle="A title, a due date, and files from the library. The student uploads their work through a link you send from the assignment page." />
      <Card>
        <NewAssignmentForm
          students={students.map((st) => ({ id: st.id, name: `${st.lastName}, ${st.firstName}` }))}
          lessonsByStudent={Object.fromEntries(Object.entries(lessonsByStudent).map(([k, v]) => [k, v.map((l) => ({ id: l.id, label: l.label }))]))}
          library={library.map((l) => ({ id: l.fileId, name: l.name, folder: l.folder }))}
          defaultStudentId={studentId}
          defaultLessonId={lessonId}
          returnTo={returnTo}
        />
      </Card>
    </div>
  );
}
