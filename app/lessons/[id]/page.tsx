import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { localDateStr, localTimeStr } from "@/src/lib/format";
import { LessonForm } from "../LessonForm";
import { cancelLessonAction, updateLessonAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { organization: { select: { timezone: true } }, students: { include: { student: true } } },
  });
  if (!lesson || lesson.deletedAt || lesson.students.length !== 1) notFound();
  const seat = lesson.students[0];
  const tz = lesson.organization.timezone;
  const tutors = await prisma.tutor.findMany({ where: { organizationId: lesson.organizationId, archivedAt: null }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/students/${seat.studentId}`} className="text-sm text-blue-700 hover:underline">{seat.student.firstName} {seat.student.lastName}</Link>
        <h1 className="mt-1 text-xl font-semibold">Edit lesson</h1>
        <p className="text-sm text-gray-600">Status {lesson.status.toLowerCase()}. Changing the price or date changes the charge on the account.</p>
      </div>
      <LessonForm
        action={updateLessonAction}
        studentId={seat.studentId}
        lessonId={lesson.id}
        tutors={tutors}
        submitLabel="Save"
        initial={{
          date: localDateStr(lesson.startsAt, tz),
          time: localTimeStr(lesson.startsAt, tz),
          durationMin: lesson.durationMin,
          subject: lesson.subject,
          price: (seat.priceCents / 100).toFixed(2),
          tutorId: lesson.tutorId ?? "",
          locationType: lesson.locationType,
          meetingLink: lesson.meetingLink ?? "",
          notes: lesson.notes ?? "",
          category: lesson.category ?? "",
        }}
      />
      {lesson.status !== "CANCELLED" && (
        <form action={cancelLessonAction} className="space-y-2 border-t border-gray-200 pt-4 text-sm">
          <h2 className="font-semibold">Cancel this lesson</h2>
          <input type="hidden" name="lessonId" value={lesson.id} />
          <input type="hidden" name="studentId" value={seat.studentId} />
          <label className="flex flex-col gap-1"><span>Reason</span><input className="rounded border border-gray-300 px-2 py-1" name="reason" required /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="chargeAnyway" /> Still charge for it (late cancellation)</label>
          <button className="rounded border border-red-700 px-3 py-1.5 text-red-700">Cancel lesson</button>
        </form>
      )}
    </div>
  );
}
