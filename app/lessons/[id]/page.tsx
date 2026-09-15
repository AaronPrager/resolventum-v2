import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { studentChoices } from "@/src/services/students";
import { listLessonCategories } from "@/src/services/lessonCategories";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatWhen, localDateStr, localTimeStr } from "@/src/lib/format";
import { cancellationOutcome } from "@/src/services/lessons";
import { LessonForm } from "../LessonForm";
import { MakeupForm } from "./MakeupForm";
import { cancelLessonAction, markNoShowAction, restoreLessonAction, updateLessonAction } from "../actions";
import { Badge, Button, Card, Field, Input, LinkButton, PageHeader, Radio } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";

export const dynamic = "force-dynamic";

const STATUS_TONE = { SCHEDULED: "brand", COMPLETED: "neutral", CANCELLED: "owed", NO_SHOW: "warn" } as const;

export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      organization: { select: { timezone: true, lateCancelHours: true, lateCancelChargePercent: true, noShowChargePercent: true, makeupOnLateCancel: true } },
      students: { include: { student: { include: { account: { include: { guardians: true } } } }, charge: { select: { amountCents: true, voidedAt: true } } } },
      sessionNotes: true,
      makeupCredits: { where: { voidedAt: null }, select: { studentId: true, amountCents: true } },
    },
  });
  if (!lesson || lesson.deletedAt || lesson.organizationId !== session.organizationId) notFound();
  if (session.role === "TUTOR" && session.tutorId && lesson.tutorId !== session.tutorId) notFound();
  const seat = lesson.students[0] ?? null; // the first student, for the back link; null for an event
  const group = lesson.students.length > 1;
  const choices = await studentChoices(prisma, lesson.organizationId, lesson.students.map((s) => s.studentId));
  const tz = lesson.organization.timezone;
  const categories = await listLessonCategories(prisma, lesson.organizationId, { include: lesson.categoryId ? [lesson.categoryId] : [] });
  const tutors = (await prisma.tutor.findMany({ where: { organizationId: lesson.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, hourlyClientRateCents: true, subjects: true, availability: true } }))
    .map((t) => ({ id: t.id, name: t.name, clientRateCents: t.hourlyClientRateCents, subjects: t.subjects, availability: t.availability }));
  const back = returnTo ?? (seat ? `/students/${seat.studentId}` : "/calendar");
  const canWrite = session.role !== "ACCOUNTANT";
  const cancelled = lesson.status === "CANCELLED" || lesson.status === "NO_SHOW";
  const outcome = cancellationOutcome(lesson.organization, lesson.startsAt);
  const liveCharge = lesson.students.some((s) => s.charge && !s.charge.voidedAt && s.charge.amountCents > 0);
  const creditable = cancelled && lesson.students.some((s) => s.charge && !s.charge.voidedAt && s.charge.amountCents > 0 && !lesson.makeupCredits.some((c) => c.studentId === s.studentId));
  const noteBack = encodeURIComponent(`/lessons/${lesson.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={group ? "Edit group lesson" : seat ? "Edit lesson" : "Edit event"}
        back={{ href: back, label: returnTo ? "Back" : seat ? `${seat.student.firstName} ${seat.student.lastName}` : "Calendar" }}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[lesson.status]}>{lesson.status.toLowerCase().replace("_", " ")}</Badge><span>{formatWhen(lesson.startsAt, tz)}</span>{lesson.seriesId && <span>Part of a weekly series.</span>}{seat ? <span>{group ? "Each student is charged on their own account." : "Changing the price or date changes the charge on the account."}</span> : <span>No student, no charge.</span>}</span>}
      />

      {seat && lesson.status !== "CANCELLED" && (
        <Card title="Session notes" actions={<span className="text-xs text-muted">One note per student. Written and sent from the note page.</span>}>
          <ul id="notes" className="divide-y divide-line text-sm">
            {lesson.students.map((s) => {
              const n = lesson.sessionNotes.find((x) => x.studentId === s.studentId) ?? null;
              return (
                <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    {group && <p className="font-medium">{s.student.firstName} {s.student.lastName}</p>}
                    {n ? (
                      <>
                        <p>{n.covered}</p>
                        <p className="text-xs text-muted">{[n.engagement && `engagement ${n.engagement}/5`, n.nextGoal && `Next: ${n.nextGoal}`, n.sharedAt ? `sent ${localDateStr(n.sharedAt, tz)}` : "not sent"].filter(Boolean).join(" · ")}</p>
                      </>
                    ) : <p className="text-muted">No note yet.</p>}
                  </div>
                  {canWrite && (n
                    ? <LinkButton href={`/notes/${n.id}?returnTo=${noteBack}`} variant="secondary">Edit the note</LinkButton>
                    : <LinkButton href={`/notes/new?lesson=${lesson.id}&student=${s.studentId}&returnTo=${noteBack}`} variant="primary">Write the note</LinkButton>)}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <LessonForm
          action={updateLessonAction}
          students={choices}
          lessonId={lesson.id}
          inSeries={lesson.seriesId !== null}
          returnTo={returnTo}
          tutors={tutors}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          submitLabel="Save"
          initial={{
            date: localDateStr(lesson.startsAt, tz), time: localTimeStr(lesson.startsAt, tz), durationMin: lesson.durationMin, subject: lesson.subject,
            seats: lesson.students.map((s) => ({ studentId: s.studentId, price: (s.priceCents / 100).toFixed(2) })), tutorId: lesson.tutorId ?? "", locationType: lesson.locationType,
            meetingLink: lesson.meetingLink ?? "", notes: lesson.notes ?? "", categoryId: lesson.categoryId ?? "", allDay: lesson.allDay,
          }}
        />
      </Card>

      {canWrite && !cancelled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={seat ? "Cancel this lesson" : "Cancel this event"}>
            <ConfirmForm action={cancelLessonAction} className="space-y-3" message="Cancel? The charge follows what you picked below. You can restore the lesson later.">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="studentId" value={seat?.studentId ?? ""} />
              <input type="hidden" name="returnTo" value={back} />
              <Field label="Reason (optional)" className="max-w-md"><Input name="reason" /></Field>
              {seat && (
                <fieldset className="space-y-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <Radio name="chargeMode" value="policy" defaultChecked label={<span>Follow the policy: {outcome.late ? <b>late cancellation, charged {lesson.organization.lateCancelChargePercent}%{lesson.organization.makeupOnLateCancel && lesson.organization.lateCancelChargePercent > 0 ? " with a make-up credit" : ""}</b> : <b>early enough, not charged</b>}</span>} />
                  <Radio name="chargeMode" value="charge" label="Charge in full" />
                  <Radio name="chargeMode" value="waive" label="Do not charge" />
                  <p className="pl-6 text-xs text-muted">Late means under {lesson.organization.lateCancelHours} hours before the start. Change the policy in Settings.</p>
                </fieldset>
              )}
              {lesson.seriesId && (
                <div className="flex flex-wrap gap-4">
                  <Radio name="scope" value="one" defaultChecked label="This lesson only" />
                  <Radio name="scope" value="future" label="This and all later lessons in the series" />
                </div>
              )}
              <Button variant="danger">{seat ? "Cancel lesson" : "Cancel event"}</Button>
            </ConfirmForm>
          </Card>
          {seat && (
            <Card title="Did not turn up">
              <ConfirmForm action={markNoShowAction} className="space-y-3" message={`Mark as a no-show? The policy charges ${lesson.organization.noShowChargePercent}% of the price.`}>
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="studentId" value={seat.studentId} />
                <input type="hidden" name="returnTo" value={back} />
                <p className="text-sm text-muted">The student missed the lesson without cancelling. The policy charges <b>{lesson.organization.noShowChargePercent}%</b> of {formatCents(lesson.students.reduce((s, x) => s + x.priceCents, 0))}. A make-up credit can be given afterwards.</p>
                <Button variant="secondary" className="text-warn">Mark no-show</Button>
              </ConfirmForm>
            </Card>
          )}
        </div>
      )}

      {canWrite && cancelled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={lesson.status === "NO_SHOW" ? "Missed lesson" : "Cancelled lesson"}>
            <p className="text-sm text-muted">
              {liveCharge ? `The family is still charged ${formatCents(lesson.students.reduce((s, x) => s + (x.charge && !x.charge.voidedAt ? x.charge.amountCents : 0), 0))} for it.` : "Nothing is charged for it."}
              {lesson.makeupCredits.length > 0 && ` ${lesson.makeupCredits.length} make-up credit${lesson.makeupCredits.length === 1 ? "" : "s"} on the account.`}
            </p>
            <form action={restoreLessonAction} className="mt-3">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="studentId" value={seat?.studentId ?? ""} />
              <Button variant="secondary">Restore the lesson</Button>
            </form>
            <p className="mt-2 text-xs text-muted">Restoring puts the full charge back and voids any make-up credit.</p>
          </Card>
          {seat && creditable && (
            <Card title="Make-up credit">
              <p className="mb-3 text-sm text-muted">Credit the family what this lesson charged, linked to it, so a make-up lesson costs them nothing. It shows on the statement as a credit.</p>
              <MakeupForm lessonId={lesson.id} studentId={seat.studentId} />
            </Card>
          )}
        </div>
      )}

      {seat && (
        <p className="text-xs text-muted">
          Statement: {[...new Set(lesson.students.map((s) => s.student.accountId))].map((a) => <Link key={a} href={`/accounts/${a}`} className="mr-2 text-brand hover:underline">{lesson.students.find((s) => s.student.accountId === a)!.student.account.name}</Link>)}
        </p>
      )}
    </div>
  );
}
