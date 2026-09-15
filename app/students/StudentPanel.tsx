import Link from "next/link";
import { BookOpenCheck, CalendarPlus, ChevronDown, NotebookPen, Pencil, Plus, Sparkles } from "lucide-react";
import { prisma } from "@/src/db";
import type { SessionUser } from "@/src/auth/session";
import { tutorScope } from "@/src/auth/current";
import { formatCents, formatDate, formatWhen } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { studentDetail } from "@/src/services/students";
import { sessionNotesForStudent } from "@/src/services/sessionNotes";
import { accountBalances } from "@/src/services/balances";
import { Avatar, Badge, Balance, Card, Empty, LinkButton } from "@/src/components/ui";
import type React from "react";
import { LessonTable } from "./LessonTable";
import { studentState } from "@/src/services/students";

/**
 * The one page for a student, under the picker on the Students page. The
 * short view first: lessons coming up and the last few, the latest notes,
 * open homework, contacts, and the balance for those who may see money.
 * Every lesson, every note, and the old progress notes sit in folds below
 * that, so nothing needs a second page. `all` opens the lesson fold with
 * every row.
 */
export async function StudentPanel({ id, session, all = false }: { id: string; session: SessionUser; all?: boolean }) {
  const detail = await studentDetail(prisma, id);
  if (!detail || detail.student.organizationId !== session.organizationId) return <Empty>Pick a student on the left.</Empty>;
  const scope = tutorScope(session);
  const { student } = detail;
  if (scope && !student.lessons.some((l) => l.lesson.tutorId === scope)) return <Empty>Not one of your students.</Empty>;
  const tz = session.timezone;
  const money = session.role !== "TUTOR";
  const now = new Date();
  const [notes, notedRows, balances] = await Promise.all([
    sessionNotesForStudent(prisma, student.id, 200),
    prisma.sessionNote.findMany({ where: { studentId: student.id }, select: { lessonId: true } }),
    money ? accountBalances(prisma, student.organization.id, localDateOnly(now, session.organizationTimezone)) : Promise.resolve([]),
  ]);
  // Every lesson that has a note, not just the few notes shown below.
  const noted = new Set(notedRows.map((n) => n.lessonId).filter((x): x is string => !!x));
  const balance = balances.find((b) => b.accountId === student.accountId)?.balanceCents ?? 0;
  const mine = (l: (typeof student.lessons)[number]) => !scope || l.lesson.tutorId === scope;
  const upcoming = student.lessons.filter((l) => l.lesson.startsAt > now && l.lesson.status === "SCHEDULED" && mine(l)).reverse().slice(0, 4);
  const recent = student.lessons.filter((l) => l.lesson.startsAt <= now && mine(l)).slice(0, 5);
  // The fold below the short lists: every lesson, capped unless `all`.
  const allUpcoming = student.lessons.filter((l) => l.lesson.startsAt > now).reverse();
  const allPast = student.lessons.filter((l) => l.lesson.startsAt <= now);
  // Lessons still owed a note: taught in the last 30 days, no note yet. Newest first, so the button opens the freshest one.
  const since = new Date(now.getTime() - 30 * 86400000);
  const needNote = student.lessons.filter((l) => mine(l) && l.lesson.status === "COMPLETED" && l.lesson.startsAt <= now && l.lesson.startsAt >= since && !noted.has(l.lesson.id));
  const openHomework = student.assignments.filter((a) => a.status !== "REVIEWED");
  const canWrite = session.role !== "ACCOUNTANT";
  const here = `/students/${student.id}`;
  const back = encodeURIComponent(here);
  const hereAll = `${here}?all=1`;
  const hasNotes = !!(student.difficulties || student.notes);

  return (
    <div className="space-y-3" data-testid="student-panel">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={`${student.firstName} ${student.lastName}`} className="size-10 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
            {student.firstName} {student.lastName}
            {studentState(student) !== "ACTIVE" && <Badge tone={student.archivedAt ? "neutral" : "warn"}>{studentState(student).toLowerCase()}</Badge>}
          </h2>
          <p className="text-sm text-muted">{[student.grade && `Grade ${student.grade}`, student.schoolName, student.defaultSubject].filter(Boolean).join(" · ") || "No grade or subject yet"}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {session.role !== "ACCOUNTANT" && <LinkButton href={`/lessons/new?student=${student.id}&returnTo=${back}`} variant="primary"><CalendarPlus aria-hidden />New lesson</LinkButton>}
        {needNote[0] && <LinkButton href={`/notes/new?lesson=${needNote[0].lesson.id}&student=${student.id}&returnTo=${back}`} variant="secondary" title={`${needNote.length} lesson${needNote.length === 1 ? "" : "s"} from the last 30 days without a session note`}><NotebookPen aria-hidden />Write the note</LinkButton>}
        <LinkButton href={`/homework?student=${student.id}`} variant="secondary"><BookOpenCheck aria-hidden />Homework</LinkButton>
        {session.role !== "ACCOUNTANT" && <LinkButton href={`/students/${student.id}/edit`} variant="secondary"><Pencil aria-hidden />Edit</LinkButton>}
        {canWrite && <LinkButton href={`/students/${student.id}/update`} variant="secondary" title="Draft an update for the parents with AI"><Sparkles aria-hidden />Parent update</LinkButton>}
      </div>

      <div className="space-y-3">
        <Card className="p-4 sm:p-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Column title="Coming up" action={session.role !== "ACCOUNTANT" && (
              <Link href={`/lessons/new?student=${student.id}&returnTo=${back}`} aria-label={`Add a lesson for ${student.firstName}`} title="Add a lesson" className="inline-flex size-6 items-center justify-center rounded-md text-brand hover:bg-brand-soft"><Plus className="size-4" aria-hidden /></Link>
            )}>
              {upcoming.length === 0 ? <p className="text-sm text-muted">Nothing booked.</p> : (
                <ul className="space-y-1 text-sm">
                  {upcoming.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-baseline gap-x-2">
                      <Link href={`/lessons/${l.lesson.id}?returnTo=${back}`} className="tabular-nums text-fg underline-offset-2 hover:text-brand hover:underline">{formatWhen(l.lesson.startsAt, tz)}</Link>
                      <span className="text-xs text-muted">{l.lesson.subject} · {l.lesson.durationMin} min{l.lesson.tutor && !scope ? ` · ${l.lesson.tutor.name}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Column>
            <Column title="Recent">
              {recent.length === 0 ? <p className="text-sm text-muted">No lessons yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {recent.map((l) => {
                    const off = l.lesson.status === "CANCELLED" || l.lesson.status === "NO_SHOW";
                    return (
                      <li key={l.id} className="flex flex-wrap items-baseline gap-x-2">
                        <Link href={`/lessons/${l.lesson.id}?returnTo=${back}`} className={`tabular-nums underline-offset-2 hover:text-brand hover:underline ${off ? "text-muted line-through" : "text-fg"}`}>{formatWhen(l.lesson.startsAt, tz)}</Link>
                        <span className="text-xs text-muted">{l.lesson.subject}{l.lesson.status === "NO_SHOW" ? " · no show" : l.lesson.status === "CANCELLED" ? " · cancelled" : ""}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Column>
          </div>
          <Fold label={`Every lesson · ${allUpcoming.length} upcoming, ${allPast.length} past`} open={all} testId="all-lessons">
            <div className="space-y-4">
              <LessonTable title={`Upcoming (${allUpcoming.length})`} rows={all ? allUpcoming : allUpcoming.slice(0, 8)} hidden={all ? 0 : Math.max(0, allUpcoming.length - 8)} tz={tz} studentId={student.id} testId="upcoming" noted={noted} back={hereAll} more={hereAll} />
              <LessonTable title={`Past (${allPast.length})`} rows={all ? allPast : allPast.slice(0, 12)} hidden={all ? 0 : Math.max(0, allPast.length - 12)} tz={tz} studentId={student.id} testId="past" noted={noted} back={hereAll} more={hereAll} />
            </div>
          </Fold>
        </Card>

        <Card className="p-4 sm:p-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Column title={`Session notes${notes.length > 3 ? ` · ${notes.length}` : ""}`}>
              {notes.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
                <ul className="space-y-2 text-sm">
                  {notes.slice(0, 3).map((n) => (
                    <li key={n.id}>
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                        <Link href={`/notes/${n.id}?returnTo=${back}`} className="tabular-nums hover:text-brand hover:underline">{formatDate(n.notedOn)}</Link>
                        <span>{n.lesson ? n.lesson.subject || "lesson" : "general"}</span>
                        {n.engagement && <span>{n.engagement}/5</span>}
                        <span>{n.sharedAt ? "sent" : "not sent"}</span>
                      </div>
                      <p className="leading-snug">{n.covered}</p>
                      {n.nextGoal && <p className="text-xs text-muted">Next: {n.nextGoal}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && <Link href={`/notes/new?student=${student.id}&returnTo=${back}`} className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-surface-3 hover:text-fg"><Plus className="size-3.5" aria-hidden />Add a note</Link>}
            </Column>
            <Column title={`Homework${openHomework.length ? ` · ${openHomework.length} open` : ""}`} action={<Link href={`/homework?student=${student.id}`} className="text-xs text-brand hover:underline">All</Link>}>
              {student.assignments.length === 0 ? <p className="text-sm text-muted">Nothing assigned.</p> : (
                <ul className="space-y-1 text-sm">
                  {student.assignments.slice(0, 4).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                      <Link href={`/homework/${a.id}?returnTo=${back}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{a.title || <span className="text-muted">Untitled</span>}</Link>
                      <Badge tone={a.status === "REVIEWED" ? "credit" : a.status === "OVERDUE" ? "owed" : a.status === "SOLVED" ? "brand" : "neutral"}>{a.status.toLowerCase()}</Badge>
                      <span className="text-xs text-muted tabular-nums">{a.dueOn ? `due ${formatDate(a.dueOn)}` : ""}{a._count.submissions > 0 ? ` · ${a._count.submissions} submitted` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && <Link href={`/homework/new?student=${student.id}&returnTo=${back}`} className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-surface-3 hover:text-fg"><Plus className="size-3.5" aria-hidden />Add homework</Link>}
            </Column>
          </div>
          {notes.length > 3 && (
            <Fold label={`Every note · ${notes.length}`} testId="all-notes">
              <ul className="divide-y divide-line text-sm" data-testid="session-notes">
                {notes.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link href={`/notes/${n.id}?returnTo=${back}`} className="w-40 shrink-0 tabular-nums text-muted hover:text-brand hover:underline">{n.lesson ? formatWhen(n.lesson.startsAt, tz) : formatDate(n.notedOn)}</Link>
                      <span className="font-medium">{n.lesson ? n.lesson.subject || "Lesson" : "General note"}</span>
                      {n.engagement && <Badge tone={n.engagement >= 4 ? "credit" : n.engagement <= 2 ? "owed" : "neutral"}>engagement {n.engagement}/5</Badge>}
                      <span className="text-xs text-muted">{n.sharedAt ? `sent ${formatDate(n.sharedAt)}` : "not sent"}</span>
                    </div>
                    <p className="mt-1">{n.covered}</p>
                    {(n.win || n.struggle || n.nextGoal) && <p className="mt-0.5 text-muted">{[n.win && `Win: ${n.win}`, n.struggle && `Struggle: ${n.struggle}`, n.nextGoal && `Next: ${n.nextGoal}`].filter(Boolean).join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            </Fold>
          )}
          {student.progressNotes.length > 0 && (
            <Fold label={`Older progress notes · ${student.progressNotes.length}`} hint="From before session notes. Read only." testId="progress-notes">
              <ul className="divide-y divide-line text-sm">
                {student.progressNotes.map((n) => (
                  <li key={n.id} className="flex gap-3 py-2.5">
                    <span className="w-24 shrink-0 tabular-nums text-muted">{formatDate(n.notedOn)}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-line">{n.note}</span>
                  </li>
                ))}
              </ul>
            </Fold>
          )}
        </Card>

        <Card className="p-4 sm:p-4">
          <div className={`grid gap-x-8 gap-y-4 sm:grid-cols-2 ${money && hasNotes ? "lg:grid-cols-3" : ""}`}>
            <Column title="Contacts">
              {student.account.guardians.length === 0 && !student.email ? <p className="text-sm text-muted">None on file.</p> : (
                <div className="space-y-1 text-sm">
                  {student.account.guardians.map((g) => (
                    <p key={g.id}>{g.name}<span className="text-muted">{[g.relationship, g.isPrimary && "primary", g.isEmergency && "emergency"].filter(Boolean).map((x) => ` · ${x}`).join("")}</span><span className="block text-xs text-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</span></p>
                  ))}
                  {student.email && <p className="text-xs text-muted">Student: {[student.email, student.phone].filter(Boolean).join(" · ")}</p>}
                </div>
              )}
              <p className="mt-2 text-xs"><Link href={`/accounts/${student.accountId}`} className="text-brand hover:underline">Change them on the account</Link></p>
            </Column>
            {money && (
              <Column title="Account">
                <p className="text-sm"><Link href={`/accounts/${student.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{student.account.name}</Link>{student.account.students.length > 1 && <span className="text-muted"> · {student.account.students.map((s) => s.firstName).join(", ")}</span>}</p>
                <p className="mt-0.5 text-sm"><Balance cents={balance} className="font-semibold" />{student.defaultPriceCents != null && <span className="text-xs text-muted"> · usual price {formatCents(student.defaultPriceCents)}</span>}</p>
                <p className="mt-2 text-xs"><a href={`/api/students/${student.id}/agreement`} className="text-brand hover:underline">Tutoring agreement (PDF)</a></p>
              </Column>
            )}
            {(hasNotes || !money) && (
              <Column title="Notes">
                {hasNotes ? (
                  <div className="space-y-0.5 text-sm">
                    {student.difficulties && <p><span className="text-muted">Finds hard: </span>{student.difficulties}</p>}
                    {student.notes && <p className="whitespace-pre-line">{student.notes}</p>}
                  </div>
                ) : <p className="text-sm text-muted">None.</p>}
              </Column>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** A closed section at the foot of a card: a one-line summary that opens to the whole thing. */
function Fold({ label, hint, open, testId, children }: { label: string; hint?: string; open?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-line pt-2" open={open} data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-sm text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs">{hint}</span>}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** A titled half of a card: a small heading, an optional action at the right, then the content. */
function Column({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
