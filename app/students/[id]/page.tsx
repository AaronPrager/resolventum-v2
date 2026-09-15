import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { sessionNotesForStudent } from "@/src/services/sessionNotes";
import { listLessonCategories } from "@/src/services/lessonCategories";
import { formatCents, formatDate, formatWhen, localDateStr } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { studentChoices, studentDetail } from "@/src/services/students";
import { accountBalances } from "@/src/services/balances";
import { LessonForm } from "@/app/lessons/LessonForm";
import { cancelLessonAction, createLessonAction, restoreLessonAction } from "@/app/lessons/actions";
import { Pencil, Plus } from "lucide-react";
import { Avatar, Badge, Balance, Button, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { StatusSwitch } from "../StatusSwitch";
import { studentState } from "@/src/services/students";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const showAll = (await searchParams).all === "1";
  const detail = await studentDetail(prisma, id);
  if (!detail || detail.student.organizationId !== session.organizationId) notFound();
  const { student } = detail;
  const tutors = detail.tutors.map((t) => ({ id: t.id, name: t.name, clientRateCents: t.hourlyClientRateCents, subjects: t.subjects, availability: t.availability }));
  const scope = tutorScope(session);
  if (scope && !student.lessons.some((l) => l.lesson.tutorId === scope)) notFound();
  const notes = await sessionNotesForStudent(prisma, student.id, 12);
  const categories = await listLessonCategories(prisma, student.organization.id);
  const noted = new Set(notes.map((n) => n.lesson?.id).filter((x): x is string => !!x));
  const choices = await studentChoices(prisma, student.organizationId, [student.id]);
  const tz = student.organization.timezone;
  const balances = await accountBalances(prisma, student.organization.id, localDateOnly(new Date(), student.organization.timezone));
  const balance = balances.find((b) => b.accountId === student.accountId)?.balanceCents ?? 0;
  const now = new Date();
  const upcoming = student.lessons.filter((l) => l.lesson.startsAt > now).reverse();
  const past = student.lessons.filter((l) => l.lesson.startsAt <= now);
  const nextSlot = new Date(now.getTime() + 24 * 3600 * 1000);
  const scheduledSolo = upcoming.filter((l) => l.lesson.status === "SCHEDULED").length;
  const hasNotes = student.difficulties || student.notes;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="inline-flex items-center gap-3"><Avatar name={`${student.firstName} ${student.lastName}`} className="size-10 text-sm" />{student.firstName} {student.lastName}{student.status !== "ACTIVE" && <Badge tone={student.status === "PAUSED" ? "warn" : "neutral"}>{student.status.toLowerCase()}</Badge>}{student.archivedAt && <Badge>archived</Badge>}</span>}
        back={{ href: "/students", label: "Students" }}
        subtitle={[student.grade && `Grade ${student.grade}`, student.schoolName, student.defaultSubject].filter(Boolean).join(" · ")}
        actions={
          <>
            <LinkButton href={`/students/${student.id}/update`} variant="primary">Parent update (AI)</LinkButton>
            <LinkButton href={`/students/${student.id}/edit`} variant="secondary"><Pencil aria-hidden />Edit</LinkButton>
            <LinkButton href={`/homework?student=${student.id}`} variant="secondary">Homework</LinkButton>
            {session.role !== "ACCOUNTANT" && <StatusSwitch studentId={student.id} state={studentState(student)} first={student.firstName} scheduled={scheduledSolo} returnTo={`/students/${student.id}`} />}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Account">
          <div className="space-y-1 text-sm">
            <p><Link href={`/accounts/${student.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{student.account.name}</Link>
              {student.account.students.length > 1 && <span className="text-muted"> · {student.account.students.map((s) => s.firstName).join(", ")}</span>}
            </p>
            <p><Balance cents={balance} className="text-base font-semibold" /></p>
            {student.defaultPriceCents != null && <p className="text-muted">Usual price {formatCents(student.defaultPriceCents)}</p>}
            <p className="pt-1"><a href={`/api/students/${student.id}/agreement`} className="text-xs text-brand hover:underline">Tutoring agreement (PDF)</a></p>
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
            {student.difficulties && <p><span className="text-muted">Difficulties: </span>{student.difficulties}</p>}
            {student.notes && <p className="whitespace-pre-line">{student.notes}</p>}
          </div>
        </Card>
      )}

      <details className="group rounded-xl border border-line bg-surface shadow-xs [&[open]>summary]:border-b [&[open]>summary]:border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[15px] font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 text-brand transition-transform group-open:rotate-45" aria-hidden />
          New lesson for {student.firstName}
        </summary>
        <div className="p-4 sm:p-5">
        <LessonForm
          action={createLessonAction}
          students={choices}
          tutors={tutors}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          submitLabel="Add lesson"
          allowRepeat
          initial={{
            date: localDateStr(nextSlot, tz), time: "16:00", durationMin: 60,
            subject: student.defaultSubject ?? "",
            seats: [{ studentId: student.id, price: student.defaultPriceCents != null ? (student.defaultPriceCents / 100).toFixed(2) : "" }],
            tutorId: tutors.length === 1 ? tutors[0].id : "", locationType: "IN_PERSON", meetingLink: "", notes: "", categoryId: "",
          }}
        />
        </div>
      </details>

      <LessonTable title={`Upcoming (${upcoming.length})`} rows={showAll ? upcoming : upcoming.slice(0, 8)} hidden={showAll ? 0 : Math.max(0, upcoming.length - 8)} tz={tz} studentId={student.id} testId="upcoming" noted={noted} />
      <LessonTable title={`Past (${past.length})`} rows={showAll ? past : past.slice(0, 12)} hidden={showAll ? 0 : Math.max(0, past.length - 12)} tz={tz} studentId={student.id} testId="past" noted={noted} />

      <Card title="Session notes" actions={session.role !== "ACCOUNTANT" ? <Link href={`/notes/new?student=${student.id}&returnTo=${encodeURIComponent(`/students/${student.id}`)}`} className="text-sm text-brand hover:underline">New note</Link> : undefined}>
        {notes.length === 0 ? <p className="text-sm text-muted">No session notes yet.</p> : (
          <ul className="divide-y divide-line" data-testid="session-notes">
            {notes.map((n) => (
              <li key={n.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={`/notes/${n.id}?returnTo=${encodeURIComponent(`/students/${student.id}`)}`} className="w-40 shrink-0 tabular-nums text-muted hover:text-brand hover:underline">{n.lesson ? formatWhen(n.lesson.startsAt, tz) : formatDate(n.notedOn)}</Link>
                  <span className="font-medium">{n.lesson ? n.lesson.subject : "General note"}</span>
                  {n.engagement && <Badge tone={n.engagement >= 4 ? "credit" : n.engagement <= 2 ? "owed" : "neutral"}>engagement {n.engagement}/5</Badge>}
                  <span className="text-xs text-muted">{n.sharedAt ? `sent ${formatDate(n.sharedAt)}` : "not sent"}</span>
                </div>
                <p className="mt-1">{n.covered}</p>
                {(n.win || n.struggle || n.nextGoal) && (
                  <p className="mt-0.5 text-muted">{[n.win && `Win: ${n.win}`, n.struggle && `Struggle: ${n.struggle}`, n.nextGoal && `Next: ${n.nextGoal}`].filter(Boolean).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {student.progressNotes.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface shadow-sm [&[open]>summary]:border-b [&[open]>summary]:border-line">
          <summary className="cursor-pointer list-none px-4 py-3 text-[15px] font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
            Older progress notes ({student.progressNotes.length})
            <span className="ml-2 text-[13px] font-normal text-muted">From before session notes. Read only.</span>
          </summary>
          <ul className="divide-y divide-line px-4 sm:px-5" data-testid="progress-notes">
            {student.progressNotes.map((n) => (
              <li key={n.id} className="flex gap-3 py-2.5 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted">{formatDate(n.notedOn)}</span>
                <span className="min-w-0 flex-1 whitespace-pre-line">{n.note}</span>
              </li>
            ))}
          </ul>
        </details>
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

function LessonTable({ title, rows, hidden, tz, studentId, testId, noted }: { title: string; rows: Seat[]; hidden: number; tz: string; studentId: string; testId: string; noted: Set<string> }) {
  return (
    <Card title={title} actions={hidden > 0 ? <Link href={`/students/${studentId}?all=1`} className="text-sm text-brand hover:underline">Show all ({hidden} more)</Link> : undefined}>
      {rows.length === 0 ? <Empty>None.</Empty> : (
        <TableWrap>
          <Table data-testid={testId}>
            <thead><tr><Th>When</Th><Th className="hidden sm:table-cell">Subject</Th><Th className="hidden md:table-cell">Tutor</Th><Th right>Price</Th><Th className="hidden sm:table-cell">Status</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const cancelled = s.lesson.status === "CANCELLED" || s.lesson.status === "NO_SHOW";
                const needsNote = s.lesson.status === "COMPLETED" && !noted.has(s.lesson.id);
                return (
                  <tr key={s.id} className={`hover:bg-surface-2 ${cancelled ? "text-muted line-through" : ""}`}>
                    <Td num><Link href={`/lessons/${s.lesson.id}`} className="underline-offset-2 hover:text-brand hover:underline">{formatWhen(s.lesson.startsAt, tz)}</Link><span className="hidden text-muted sm:inline"> · {s.lesson.durationMin} min</span></Td>
                    <Td className="hidden sm:table-cell">{s.lesson.subject}{s.lesson.locationType === "REMOTE" && <span className="ml-1 text-xs text-muted">remote</span>}{s.lesson.seriesId && <span className="ml-1 text-xs text-muted">weekly</span>}</Td>
                    <Td className="hidden md:table-cell">{s.lesson.tutor?.name ?? ""}</Td>
                    <Td right num>{formatCents(s.priceCents)}{s.charge?.voidedAt && <span className="ml-1 text-xs no-underline">not charged</span>}</Td>
                    <Td className="hidden sm:table-cell"><span className="no-underline"><Badge tone={s.lesson.status === "CANCELLED" ? "owed" : s.lesson.status === "NO_SHOW" ? "warn" : s.lesson.status === "COMPLETED" ? "neutral" : "brand"}>{s.lesson.status.toLowerCase().replace("_", " ")}</Badge></span></Td>
                    <Td right>
                      <span className="inline-flex gap-3 no-underline">
                        {needsNote && <Link href={`/notes/new?lesson=${s.lesson.id}&student=${studentId}&returnTo=${encodeURIComponent(`/students/${studentId}`)}`} className="text-warn hover:underline">Note</Link>}
                        <Link href={`/lessons/${s.lesson.id}`} className="hidden text-brand hover:underline sm:inline">Edit</Link>
                        {cancelled ? (
                          <form action={restoreLessonAction} className="inline">
                            <input type="hidden" name="lessonId" value={s.lesson.id} /><input type="hidden" name="studentId" value={studentId} />
                            <Button variant="link">Restore</Button>
                          </form>
                        ) : (
                          <ConfirmForm action={cancelLessonAction} className="inline" message="Cancel this lesson? The charge is voided and the balance changes. You can restore it later.">
                            <input type="hidden" name="lessonId" value={s.lesson.id} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="reason" value="Cancelled" /><input type="hidden" name="chargeMode" value="waive" />
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
