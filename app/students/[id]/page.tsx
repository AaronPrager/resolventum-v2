import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatDate, formatWhen, localDateStr } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { studentDetail } from "@/src/services/students";
import { accountBalances } from "@/src/services/balances";
import { LessonForm } from "@/app/lessons/LessonForm";
import { cancelLessonAction, createLessonAction, restoreLessonAction } from "@/app/lessons/actions";
import { Badge, Balance, Button, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const showAll = (await searchParams).all === "1";
  const detail = await studentDetail(prisma, id);
  if (!detail || detail.student.organizationId !== session.organizationId) notFound();
  const { student, tutors } = detail;
  const tz = student.organization.timezone;
  const balances = await accountBalances(prisma, student.organization.id, localDateOnly(new Date(), student.organization.timezone));
  const balance = balances.find((b) => b.accountId === student.accountId)?.balanceCents ?? 0;
  const now = new Date();
  const upcoming = student.lessons.filter((l) => l.lesson.startsAt > now).reverse();
  const past = student.lessons.filter((l) => l.lesson.startsAt <= now);
  const nextSlot = new Date(now.getTime() + 24 * 3600 * 1000);
  const hasNotes = student.lastStopNote || student.nextStartNote || student.difficulties || student.notes;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span>{student.firstName} {student.lastName}{student.archivedAt && <Badge>archived</Badge>}</span>}
        back={{ href: "/students", label: "Students" }}
        subtitle={[student.grade && `Grade ${student.grade}`, student.schoolName, student.defaultSubject].filter(Boolean).join(" · ")}
        actions={<><LinkButton href={`/students/${student.id}/update`} variant="primary">Parent update (AI)</LinkButton><LinkButton href={`/homework?student=${student.id}`} variant="secondary">Homework</LinkButton></>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Account">
          <div className="space-y-1 text-sm">
            <p><Link href={`/accounts/${student.accountId}`} className="font-medium text-brand hover:underline">{student.account.name}</Link>
              {student.account.students.length > 1 && <span className="text-muted"> · {student.account.students.map((s) => s.firstName).join(", ")}</span>}
            </p>
            <p><Balance cents={balance} className="text-base font-semibold" /></p>
            {student.defaultPriceCents != null && <p className="text-muted">Usual price {formatCents(student.defaultPriceCents)}</p>}
          </div>
        </Card>
        <Card title="Contacts">
          <div className="space-y-1 text-sm">
            {student.email && <p>{student.email}{student.phone && ` · ${student.phone}`}</p>}
            {student.account.guardians.map((g) => (
              <p key={g.id}><span className="text-muted">{g.isEmergency ? "Emergency: " : g.isPrimary ? "Parent: " : ""}</span>{g.name}{g.email && ` · ${g.email}`}{g.phone && ` · ${g.phone}`}</p>
            ))}
            {student.account.guardians.length === 0 && !student.email && <p className="text-muted">None on file.</p>}
          </div>
        </Card>
      </div>

      {hasNotes && (
        <Card title="Notes">
          <div className="space-y-1 text-sm">
            {student.lastStopNote && <p><span className="text-muted">Stopped at: </span>{student.lastStopNote}</p>}
            {student.nextStartNote && <p><span className="text-muted">Start next: </span>{student.nextStartNote}</p>}
            {student.difficulties && <p><span className="text-muted">Difficulties: </span>{student.difficulties}</p>}
            {student.notes && <p className="whitespace-pre-line">{student.notes}</p>}
          </div>
        </Card>
      )}

      <Card title="New lesson">
        <LessonForm
          action={createLessonAction}
          studentId={student.id}
          tutors={tutors}
          submitLabel="Add lesson"
          allowRepeat
          initial={{
            date: localDateStr(nextSlot, tz), time: "16:00", durationMin: 60,
            subject: student.defaultSubject ?? "",
            price: student.defaultPriceCents != null ? (student.defaultPriceCents / 100).toFixed(2) : "",
            tutorId: tutors.length === 1 ? tutors[0].id : "", locationType: "IN_PERSON", meetingLink: "", notes: "", category: "",
          }}
        />
      </Card>

      <LessonTable title={`Upcoming (${upcoming.length})`} rows={showAll ? upcoming : upcoming.slice(0, 8)} hidden={showAll ? 0 : Math.max(0, upcoming.length - 8)} tz={tz} studentId={student.id} testId="upcoming" />
      <LessonTable title={`Past (${past.length})`} rows={showAll ? past : past.slice(0, 12)} hidden={showAll ? 0 : Math.max(0, past.length - 12)} tz={tz} studentId={student.id} testId="past" />

      {student.progressNotes.length > 0 && (
        <Card title="Progress notes">
          <div className="space-y-1.5 text-sm">
            {student.progressNotes.map((n) => <p key={n.id}><span className="mr-2 text-muted tabular-nums">{formatDate(n.notedOn)}</span>{n.note}</p>)}
          </div>
        </Card>
      )}

      {student.assignments.length > 0 && (
        <Card title="Homework">
          <div className="space-y-1.5 text-sm">
            {student.assignments.map((a) => (
              <p key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted tabular-nums">{a.dueOn ? formatDate(a.dueOn) : "no due date"}</span>
                <span>{a.title}</span>
                <Badge tone={a.status === "REVIEWED" ? "credit" : a.status === "OVERDUE" ? "owed" : a.status === "SOLVED" ? "brand" : "neutral"}>{a.status.toLowerCase()}</Badge>
                {a._count.submissions > 0 && <span className="text-xs text-muted">{a._count.submissions} submitted</span>}
              </p>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

type Seat = NonNullable<Awaited<ReturnType<typeof studentDetail>>>["student"]["lessons"][number];

function LessonTable({ title, rows, hidden, tz, studentId, testId }: { title: string; rows: Seat[]; hidden: number; tz: string; studentId: string; testId: string }) {
  return (
    <Card title={title} actions={hidden > 0 ? <Link href={`/students/${studentId}?all=1`} className="text-sm text-brand hover:underline">Show all ({hidden} more)</Link> : undefined}>
      {rows.length === 0 ? <Empty>None.</Empty> : (
        <TableWrap>
          <Table data-testid={testId}>
            <thead><tr><Th>When</Th><Th>Subject</Th><Th className="hidden sm:table-cell">Tutor</Th><Th right>Price</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const cancelled = s.lesson.status === "CANCELLED";
                return (
                  <tr key={s.id} className={`hover:bg-surface-2 ${cancelled ? "text-muted line-through" : ""}`}>
                    <Td num>{formatWhen(s.lesson.startsAt, tz)}<span className="text-muted"> · {s.lesson.durationMin} min</span></Td>
                    <Td>{s.lesson.subject}{s.lesson.locationType === "REMOTE" && <span className="ml-1 text-xs text-muted">remote</span>}{s.lesson.seriesId && <span className="ml-1 text-xs text-muted">weekly</span>}</Td>
                    <Td className="hidden sm:table-cell">{s.lesson.tutor?.name ?? ""}</Td>
                    <Td right num>{formatCents(s.priceCents)}{s.charge?.voidedAt && <span className="ml-1 text-xs no-underline">not charged</span>}</Td>
                    <Td><span className="no-underline"><Badge tone={cancelled ? "owed" : s.lesson.status === "COMPLETED" ? "neutral" : "brand"}>{s.lesson.status.toLowerCase()}</Badge></span></Td>
                    <Td right>
                      <span className="inline-flex gap-3 no-underline">
                        <Link href={`/lessons/${s.lesson.id}`} className="text-brand hover:underline">Edit</Link>
                        {cancelled ? (
                          <form action={restoreLessonAction} className="inline">
                            <input type="hidden" name="lessonId" value={s.lesson.id} /><input type="hidden" name="studentId" value={studentId} />
                            <Button variant="link">Restore</Button>
                          </form>
                        ) : (
                          <ConfirmForm action={cancelLessonAction} className="inline" message="Cancel this lesson? The charge is voided and the balance changes. You can restore it later.">
                            <input type="hidden" name="lessonId" value={s.lesson.id} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="reason" value="Cancelled" />
                            <Button variant="link" className="text-owed">Cancel</Button>
                          </ConfirmForm>
                        )}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}
