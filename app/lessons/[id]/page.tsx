import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { studentChoices } from "@/src/services/students";
import { requireSession } from "@/src/auth/current";
import { localDateStr, localTimeStr } from "@/src/lib/format";
import { LessonForm } from "../LessonForm";
import { cancelLessonAction, updateLessonAction } from "../actions";
import { Badge, Button, Card, Checkbox, Field, Input, PageHeader, Radio } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { organization: { select: { timezone: true } }, students: { include: { student: true } } },
  });
  if (!lesson || lesson.deletedAt || lesson.organizationId !== session.organizationId) notFound();
  const seat = lesson.students[0] ?? null; // the first student, for the back link; null for an event
  const group = lesson.students.length > 1;
  const choices = await studentChoices(prisma, lesson.organizationId, lesson.students.map((s) => s.studentId));
  const tz = lesson.organization.timezone;
  const tutors = await prisma.tutor.findMany({ where: { organizationId: lesson.organizationId, archivedAt: null }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <PageHeader
        title={group ? "Edit group lesson" : seat ? "Edit lesson" : "Edit event"}
        back={{ href: returnTo ?? (seat ? `/students/${seat.studentId}` : "/calendar"), label: returnTo ? "Back" : seat ? `${seat.student.firstName} ${seat.student.lastName}` : "Calendar" }}
        subtitle={<span className="inline-flex items-center gap-2"><Badge tone={lesson.status === "CANCELLED" ? "owed" : "brand"}>{lesson.status.toLowerCase()}</Badge>{lesson.seriesId && <span>Part of a weekly series.</span>}{seat ? <span>{group ? "Each student is charged on their own account." : "Changing the price or date changes the charge on the account."}</span> : <span>No student, no charge.</span>}</span>}
      />
      <Card>
        <LessonForm
          action={updateLessonAction}
          students={choices}
          lessonId={lesson.id}
          inSeries={lesson.seriesId !== null}
          returnTo={returnTo}
          tutors={tutors}
          submitLabel="Save"
          initial={{
            date: localDateStr(lesson.startsAt, tz), time: localTimeStr(lesson.startsAt, tz), durationMin: lesson.durationMin, subject: lesson.subject,
            seats: lesson.students.map((s) => ({ studentId: s.studentId, price: (s.priceCents / 100).toFixed(2) })), tutorId: lesson.tutorId ?? "", locationType: lesson.locationType,
            meetingLink: lesson.meetingLink ?? "", notes: lesson.notes ?? "", category: lesson.category ?? "", allDay: lesson.allDay,
          }}
        />
      </Card>
      {lesson.status !== "CANCELLED" && (
        <Card title={seat ? "Cancel this lesson" : "Cancel this event"}>
          <ConfirmForm action={cancelLessonAction} className="space-y-3" message="Cancel? Charges for the cancelled lessons are voided unless you ticked still charge.">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="studentId" value={seat?.studentId ?? ""} />
            <input type="hidden" name="returnTo" value={returnTo ?? (seat ? `/students/${seat.studentId}` : "/calendar")} />
            <Field label="Reason (optional)" className="max-w-md"><Input name="reason" /></Field>
            {seat && <Checkbox name="chargeAnyway" label="Still charge for it (late cancellation)" />}
            {lesson.seriesId && (
              <div className="flex flex-wrap gap-4">
                <Radio name="scope" value="one" defaultChecked label="This lesson only" />
                <Radio name="scope" value="future" label="This and all later lessons in the series" />
              </div>
            )}
            <Button variant="danger">{seat ? "Cancel lesson" : "Cancel event"}</Button>
          </ConfirmForm>
        </Card>
      )}
    </div>
  );
}
