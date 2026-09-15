import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClockOff, BookOpen, CalendarClock, Clock, ExternalLink, FileText, MapPin, Paperclip, Plus, Repeat, StickyNote, Tag, User, Video } from "lucide-react";
import type { ReactNode } from "react";
import { prisma } from "@/src/db";
import { studentChoices } from "@/src/services/students";
import { listLessonCategories } from "@/src/services/lessonCategories";
import { accountBalances } from "@/src/services/balances";
import { effectiveStatus } from "@/src/services/homework";
import { ENGAGEMENT_LABELS } from "@/src/services/sessionNotes";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatDate, formatDay, formatTime, formatWhen, localDateStr, localTimeStr } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { cancellationOutcome } from "@/src/services/lessons";
import { LessonForm } from "../LessonForm";
import { MakeupForm } from "./MakeupForm";
import { LessonScreen } from "./LessonScreen";
import { cancelLessonAction, markNoShowAction, restoreLessonAction, updateLessonAction } from "../actions";
import { Avatar, Badge, Balance, Button, Card, Field, Input, LinkButton, Radio, Select, cx } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";

export const dynamic = "force-dynamic";

const STATUS_TONE = { SCHEDULED: "brand", COMPLETED: "credit", CANCELLED: "owed", NO_SHOW: "warn" } as const;
const STATUS_LABEL = { SCHEDULED: "scheduled", COMPLETED: "taught", CANCELLED: "cancelled", NO_SHOW: "no-show" } as const;
const HOMEWORK_TONE = { PENDING: "neutral", ASSIGNED: "brand", SOLVED: "warn", REVIEWED: "credit", OVERDUE: "owed" } as const;

function kb(n: number) { return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; }

/** One line of the overview: an icon, a small label, and the value. */
function Fact({ icon, label, children, className }: { icon: ReactNode; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-w-0 items-start gap-2.5", className)}>
      <span className="mt-0.5 shrink-0 text-faint [&_svg]:size-4" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{label}</div>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Five dots for engagement 1 to 5. */
function Engagement({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${n} of 5, ${ENGAGEMENT_LABELS[n] ?? ""}`}>
      <span className="inline-flex gap-0.5" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("size-2 rounded-full", i <= n ? "bg-brand" : "bg-surface-3")} />)}</span>
      <span className="text-xs text-muted">{ENGAGEMENT_LABELS[n] ?? `${n}/5`}</span>
    </span>
  );
}

/** A labelled paragraph inside a note. Skipped when empty. */
function NoteLine({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2 text-sm sm:grid-cols-[6rem_1fr]">
      <span className="text-[11px] font-medium uppercase leading-5 tracking-[0.05em] text-muted">{label}</span>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string; edit?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { returnTo, edit } = await searchParams;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      organization: { select: { timezone: true, lateCancelHours: true, lateCancelChargePercent: true, noShowChargePercent: true, makeupOnLateCancel: true } },
      tutor: { select: { id: true, name: true } },
      category: { select: { name: true } },
      series: { select: { endsOn: true, skipHolidays: true } },
      students: { include: { student: { select: { id: true, firstName: true, lastName: true, grade: true, accountId: true, account: { select: { name: true } } } }, charge: { select: { amountCents: true, voidedAt: true, voidReason: true } } } },
      sessionNotes: true,
      assignments: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, dueOn: true, status: true, archivedAt: true, studentId: true, _count: { select: { submissions: true, files: true } } } },
      files: { include: { file: { select: { id: true, name: true, sizeBytes: true } } } },
      makeupCredits: { where: { voidedAt: null }, select: { studentId: true, amountCents: true } },
    },
  });
  if (!lesson || lesson.deletedAt || lesson.organizationId !== session.organizationId) notFound();
  if (session.role === "TUTOR" && session.tutorId && lesson.tutorId !== session.tutorId) notFound();
  const seat = lesson.students[0] ?? null; // the first student, for the back link; null for an event
  const group = lesson.students.length > 1;
  const tz = lesson.organization.timezone;
  const today = localDateOnly(new Date(), tz);
  const accountIds = [...new Set(lesson.students.map((s) => s.student.accountId))];
  const [choices, categories, tutorRows, balances] = await Promise.all([
    studentChoices(prisma, lesson.organizationId, lesson.students.map((s) => s.studentId)),
    listLessonCategories(prisma, lesson.organizationId, { include: lesson.categoryId ? [lesson.categoryId] : [] }),
    prisma.tutor.findMany({ where: { organizationId: lesson.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, hourlyClientRateCents: true, subjects: true, availability: true } }),
    accountIds.length ? accountBalances(prisma, lesson.organizationId, today) : Promise.resolve([]),
  ]);
  const tutors = tutorRows.map((t) => ({ id: t.id, name: t.name, clientRateCents: t.hourlyClientRateCents, subjects: t.subjects, availability: t.availability }));
  const balanceOf = new Map(balances.map((b) => [b.accountId, b.balanceCents]));
  const back = returnTo ?? (seat ? `/students/${seat.studentId}` : "/calendar");
  const canWrite = session.role !== "ACCOUNTANT";
  const cancelled = lesson.status === "CANCELLED" || lesson.status === "NO_SHOW";
  const outcome = cancellationOutcome(lesson.organization, lesson.startsAt);
  const liveCharge = lesson.students.some((s) => s.charge && !s.charge.voidedAt && s.charge.amountCents > 0);
  const creditable = cancelled && lesson.students.some((s) => s.charge && !s.charge.voidedAt && s.charge.amountCents > 0 && !lesson.makeupCredits.some((c) => c.studentId === s.studentId));
  const here = `/lessons/${lesson.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const hereBack = encodeURIComponent(here);
  const names = lesson.students.map((s) => `${s.student.firstName} ${s.student.lastName}`);
  const endsAt = new Date(lesson.startsAt.getTime() + lesson.durationMin * 60_000);
  const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" }).formatToParts(lesson.startsAt);
  const part = (t: Intl.DateTimeFormatPartTypes) => dateParts.find((p) => p.type === t)?.value ?? "";
  const priceTotal = lesson.students.reduce((s, x) => s + x.priceCents, 0);
  const chargedTotal = lesson.students.reduce((s, x) => s + (x.charge && !x.charge.voidedAt ? x.charge.amountCents : 0), 0);
  const seatNote = seat ? lesson.sessionNotes.find((x) => x.studentId === seat.studentId) ?? null : null;
  const notesFiles = lesson.files.filter((f) => f.kind === "NOTES");
  const homeworkFiles = lesson.files.filter((f) => f.kind === "HOMEWORK");

  const overview = (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm" data-testid="lesson-overview">
      <div className="grid md:grid-cols-[11rem_1fr]">
        <div className={cx("flex flex-col items-center justify-center gap-0.5 border-b border-line px-5 py-5 text-center md:border-b-0 md:border-r", cancelled ? "bg-surface-2" : "bg-gradient-to-br from-brand-soft via-brand-soft/60 to-surface")}>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{part("weekday")}</span>
          <span className={cx("text-5xl font-semibold leading-none tracking-[-0.03em]", cancelled ? "text-muted line-through decoration-2" : "text-brand")}>{part("day")}</span>
          <span className="text-sm text-muted">{part("month")} {part("year")}</span>
          <span className="mt-2 text-sm font-medium tabular-nums">{lesson.allDay ? "All day" : `${formatTime(lesson.startsAt, tz)} to ${formatTime(endsAt, tz)}`}</span>
        </div>
        <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Fact icon={<Clock />} label="Length">{lesson.allDay ? "The whole day" : `${lesson.durationMin} minutes`}</Fact>
          <Fact icon={<User />} label="Tutor">{lesson.tutor ? <Link href="/settings/tutors" className="hover:text-brand hover:underline">{lesson.tutor.name}</Link> : <span className="text-muted">No tutor</span>}</Fact>
          <Fact icon={lesson.locationType === "REMOTE" ? <Video /> : <MapPin />} label="Where">
            {lesson.locationType === "REMOTE" ? "Remote" : "In person"}
            {lesson.meetingLink && <a href={lesson.meetingLink} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-brand hover:underline">Join<ExternalLink className="size-3.5" aria-hidden /></a>}
          </Fact>
          <Fact icon={<Tag />} label="Category">{lesson.category ? lesson.category.name : <span className="text-muted">None</span>}</Fact>
          <Fact icon={<Repeat />} label="Repeats">
            {lesson.series ? <>Weekly{lesson.series.endsOn ? ` until ${formatDate(lesson.series.endsOn)}` : ""}{lesson.series.skipHolidays ? ", skips holidays" : ""}</> : <span className="text-muted">One-off</span>}
          </Fact>
          <Fact icon={<CalendarClock />} label="Made">{formatDay(lesson.createdAt, tz)}</Fact>
          {lesson.notes && <Fact icon={<StickyNote />} label="On the calendar" className="sm:col-span-2 lg:col-span-3"><p className="whitespace-pre-line">{lesson.notes}</p></Fact>}
        </div>
      </div>
      {seat && (
        <ul className="divide-y divide-line border-t border-line" data-testid="roster-view">
          {lesson.students.map((s) => {
            const charge = s.charge;
            const bal = balanceOf.get(s.student.accountId) ?? 0;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <Avatar name={`${s.student.firstName} ${s.student.lastName}`} />
                <div className="min-w-0 flex-1">
                  <Link href={`/students/${s.studentId}`} className="font-medium underline-offset-2 hover:text-brand hover:underline">{s.student.firstName} {s.student.lastName}</Link>
                  <div className="text-xs text-muted">
                    {[s.student.grade && `Grade ${s.student.grade}`, <Link key="a" href={`/accounts/${s.student.accountId}`} className="hover:text-brand hover:underline">{s.student.account.name}</Link>].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && " · "}{x}</span>)}
                    {" · "}<Balance cents={bal} className="font-normal" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums">{formatCents(s.priceCents)}</div>
                  <div className="text-xs text-muted">
                    {!charge ? "not charged" : charge.voidedAt ? <span className="text-credit">not charged{charge.voidReason ? `: ${charge.voidReason}` : ""}</span> : charge.amountCents === s.priceCents ? "on the statement" : `charged ${formatCents(charge.amountCents)}`}
                  </div>
                </div>
              </li>
            );
          })}
          {group && (
            <li className="flex items-center justify-between px-5 py-2.5 text-sm text-muted">
              <span>{lesson.students.length} students, each on their own account</span>
              <span className="tabular-nums">{formatCents(priceTotal)} in all{chargedTotal !== priceTotal ? `, ${formatCents(chargedTotal)} charged` : ""}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );

  const form = (
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
  );

  return (
    <LessonScreen
      lessonId={lesson.id}
      title={lesson.subject}
      editTitle={group ? "Edit group lesson" : seat ? "Edit lesson" : "Edit event"}
      back={{ href: back, label: returnTo ? "Back" : seat ? `${seat.student.firstName} ${seat.student.lastName}` : "Calendar" }}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[lesson.status]}>{STATUS_LABEL[lesson.status]}</Badge>
          {names.length > 0 && <span className="text-fg">{names.join(", ")}</span>}
          <span>{formatWhen(lesson.startsAt, tz)}</span>
          {lesson.seriesId && <span>Part of a weekly series.</span>}
        </span>
      }
      canWrite={canWrite}
      defaultEditing={edit === "1"}
      what={`${names.length ? `${names.join(", ")}, ` : ""}${lesson.subject} on ${formatWhen(lesson.startsAt, tz)}`}
      inSeries={lesson.seriesId !== null}
      charged={liveCharge}
      overview={overview}
      form={form}
    >
      {seat && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Session notes"
            description={lesson.status === "CANCELLED" ? "Cancelled, so nothing to write." : group ? "One note per student." : seatNote ? (seatNote.sharedAt ? "Sent to the family." : "Written, not sent yet.") : "Nothing written yet."}
            actions={canWrite && lesson.status !== "CANCELLED" && !group && (
              seatNote
                ? <LinkButton href={`/notes/${seatNote.id}?returnTo=${hereBack}`} variant="secondary"><FileText aria-hidden />Open the note</LinkButton>
                : <LinkButton href={`/notes/new?lesson=${lesson.id}&student=${seat.studentId}&returnTo=${hereBack}`} variant="primary"><Plus aria-hidden />Write the note</LinkButton>
            )}
          >
            <ul id="notes" className="divide-y divide-line" data-testid="notes">
              {lesson.students.map((s) => {
                const n = lesson.sessionNotes.find((x) => x.studentId === s.studentId) ?? null;
                return (
                  <li key={s.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {group && <span className="text-sm font-medium">{s.student.firstName} {s.student.lastName}</span>}
                      {n ? (n.sharedAt ? <Badge tone="credit">sent {formatDay(n.sharedAt, tz)}</Badge> : <Badge tone="warn">not sent</Badge>) : <Badge>no note</Badge>}
                      {n?.engagement != null && <Engagement n={n.engagement} />}
                      {canWrite && lesson.status !== "CANCELLED" && group && (
                        <span className="ml-auto">
                          {n
                            ? <LinkButton href={`/notes/${n.id}?returnTo=${hereBack}`} variant="secondary"><FileText aria-hidden />Open the note</LinkButton>
                            : <LinkButton href={`/notes/new?lesson=${lesson.id}&student=${s.studentId}&returnTo=${hereBack}`} variant="primary"><Plus aria-hidden />Write the note</LinkButton>}
                        </span>
                      )}
                    </div>
                    {n ? (
                      <div className="space-y-1.5">
                        <NoteLine label="Covered" text={n.covered} />
                        <NoteLine label="Homework" text={n.homework} />
                        <NoteLine label="Win" text={n.win} />
                        <NoteLine label="Struggle" text={n.struggle} />
                        <NoteLine label="Next" text={n.nextGoal} />
                      </div>
                    ) : lesson.status !== "CANCELLED" && <p className="text-sm text-muted">Nothing written for {group ? s.student.firstName : "this lesson"} yet.</p>}
                  </li>
                );
              })}
            </ul>
            {notesFiles.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {notesFiles.map((f) => <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-3.5 text-faint" aria-hidden /><a href={`/api/files/${f.file.id}`} className="text-brand hover:underline">{f.file.name}</a><span className="text-xs text-muted">{kb(f.file.sizeBytes)}</span></li>)}
              </ul>
            )}
          </Card>

          <Card
            title="Homework"
            description={lesson.assignments.length === 0 && !lesson.homeworkText ? "Nothing set from this lesson." : `${lesson.assignments.length} assignment${lesson.assignments.length === 1 ? "" : "s"} from this lesson.`}
            actions={canWrite && !cancelled && (
              group
                ? <span className="text-xs text-muted">Add below, per student.</span>
                : <LinkButton href={`/homework/new?student=${seat.studentId}&lesson=${lesson.id}&returnTo=${hereBack}`} variant="primary"><Plus aria-hidden />Add homework</LinkButton>
            )}
          >
            {lesson.assignments.length > 0 && (
              <ul className="divide-y divide-line" data-testid="lesson-homework">
                {lesson.assignments.map((a) => {
                  const st = effectiveStatus(a, today);
                  const who = lesson.students.find((s) => s.studentId === a.studentId)?.student;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                      <BookOpen className="size-4 shrink-0 text-faint" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Link href={`/homework/${a.id}?returnTo=${hereBack}`} className={cx("font-medium underline-offset-2 hover:text-brand hover:underline", a.archivedAt && "text-muted")}>{a.title || "Untitled homework"}</Link>
                        <div className="text-xs text-muted">
                          {[group && who && `${who.firstName} ${who.lastName}`, a.dueOn ? `due ${formatDate(a.dueOn)}` : "no due date", a._count.files > 0 && `${a._count.files} file${a._count.files === 1 ? "" : "s"}`, a._count.submissions > 0 && `${a._count.submissions} handed in`, a.archivedAt && "archived"].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Badge tone={HOMEWORK_TONE[st]}>{st === "SOLVED" ? "to review" : st.toLowerCase()}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            {lesson.homeworkText && (
              <div className={cx("rounded-lg bg-surface-2 px-3 py-2 text-sm", lesson.assignments.length > 0 && "mt-3")}>
                <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Written on the lesson{lesson.homeworkDueOn ? `, due ${formatDate(lesson.homeworkDueOn)}` : ""}</div>
                <p className="mt-0.5 whitespace-pre-line">{lesson.homeworkText}</p>
              </div>
            )}
            {homeworkFiles.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {homeworkFiles.map((f) => <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-3.5 text-faint" aria-hidden /><a href={`/api/files/${f.file.id}`} className="text-brand hover:underline">{f.file.name}</a><span className="text-xs text-muted">{kb(f.file.sizeBytes)}</span></li>)}
              </ul>
            )}
            {group && canWrite && !cancelled && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {lesson.students.map((s) => <LinkButton key={s.id} href={`/homework/new?student=${s.studentId}&lesson=${lesson.id}&returnTo=${hereBack}`} variant="secondary"><Plus aria-hidden />{s.student.firstName}</LinkButton>)}
              </div>
            )}
            {lesson.assignments.length === 0 && !lesson.homeworkText && homeworkFiles.length === 0 && (
              <p className="text-sm text-muted">{cancelled ? "The lesson did not happen." : "Set homework here and the student gets a link to hand it in."}</p>
            )}
          </Card>
        </div>
      )}

      {canWrite && !cancelled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={seat ? "Cancel this lesson" : "Cancel this event"} description={seat ? "The charge follows the policy, or your choice below. It can be restored later." : "It stays in the records as cancelled."}>
            <ConfirmForm action={cancelLessonAction} className="space-y-3" message="Cancel? The charge follows what you picked below. You can restore the lesson later.">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="studentId" value={seat?.studentId ?? ""} />
              <input type="hidden" name="returnTo" value={back} />
              <Field label="Reason (optional)" className="max-w-md"><Input name="reason" /></Field>
              {seat && (
                <Field label="Charge" className="max-w-md" hint={`Late means under ${lesson.organization.lateCancelHours} hours before the start. Change the policy in Settings.`}>
                  <Select name="chargeMode" defaultValue="policy">
                    <option value="policy">Follow the policy: {outcome.late ? `late cancellation, charged ${lesson.organization.lateCancelChargePercent}%${lesson.organization.makeupOnLateCancel && lesson.organization.lateCancelChargePercent > 0 ? " with a make-up credit" : ""}` : "early enough, not charged"}</option>
                    <option value="charge">Charge in full</option>
                    <option value="waive">Do not charge</option>
                  </Select>
                </Field>
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
            <Card title="Did not turn up" description="The student missed the lesson without cancelling.">
              <ConfirmForm action={markNoShowAction} className="space-y-3" message={`Mark as a no-show? The policy charges ${lesson.organization.noShowChargePercent}% of the price.`}>
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="studentId" value={seat.studentId} />
                <input type="hidden" name="returnTo" value={back} />
                <p className="text-sm text-muted">The policy charges <b>{lesson.organization.noShowChargePercent}%</b> of {formatCents(priceTotal)}. A make-up credit can be given afterwards.</p>
                <Button variant="secondary" className="text-warn"><AlarmClockOff aria-hidden />Mark no-show</Button>
              </ConfirmForm>
            </Card>
          )}
        </div>
      )}

      {canWrite && cancelled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={lesson.status === "NO_SHOW" ? "Missed lesson" : "Cancelled lesson"}>
            <p className="text-sm text-muted">
              {liveCharge ? `The family is still charged ${formatCents(chargedTotal)} for it.` : "Nothing is charged for it."}
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
    </LessonScreen>
  );
}
