import Link from "next/link";
import { BookOpenCheck, CalendarPlus, ExternalLink, NotebookPen, Pencil, Plus } from "lucide-react";
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

/**
 * The right-hand side of the Students page: everything a tutor needs about
 * one student without leaving the list. Lessons coming up, the last ones and
 * whether they have a note, the latest notes, open homework, contacts, and
 * the balance for those who may see money. The full page is one click away.
 */
export async function StudentPanel({ id, session }: { id: string; session: SessionUser }) {
  const detail = await studentDetail(prisma, id);
  if (!detail || detail.student.organizationId !== session.organizationId) return <Empty>Pick a student on the left.</Empty>;
  const scope = tutorScope(session);
  const { student } = detail;
  if (scope && !student.lessons.some((l) => l.lesson.tutorId === scope)) return <Empty>Not one of your students.</Empty>;
  const tz = session.timezone;
  const money = session.role !== "TUTOR";
  const now = new Date();
  const [notes, notedRows, balances] = await Promise.all([
    sessionNotesForStudent(prisma, student.id, 4),
    prisma.sessionNote.findMany({ where: { studentId: student.id }, select: { lessonId: true } }),
    money ? accountBalances(prisma, student.organization.id, localDateOnly(now, session.organizationTimezone)) : Promise.resolve([]),
  ]);
  // Every lesson that has a note, not just the few notes shown below.
  const noted = new Set(notedRows.map((n) => n.lessonId));
  const balance = balances.find((b) => b.accountId === student.accountId)?.balanceCents ?? 0;
  const mine = (l: (typeof student.lessons)[number]) => !scope || l.lesson.tutorId === scope;
  const upcoming = student.lessons.filter((l) => l.lesson.startsAt > now && l.lesson.status === "SCHEDULED" && mine(l)).reverse().slice(0, 4);
  const recent = student.lessons.filter((l) => l.lesson.startsAt <= now && mine(l)).slice(0, 5);
  // Lessons still owed a note: taught in the last 30 days, no note yet. Newest first, so the button opens the freshest one.
  const since = new Date(now.getTime() - 30 * 86400000);
  const needNote = student.lessons.filter((l) => mine(l) && l.lesson.status === "COMPLETED" && l.lesson.startsAt <= now && l.lesson.startsAt >= since && !noted.has(l.lesson.id));
  const openHomework = student.assignments.filter((a) => a.status !== "REVIEWED");
  const here = `/students?s=${student.id}`;
  const back = encodeURIComponent(here);
  const primary = student.account.guardians.find((g) => g.isPrimary) ?? student.account.guardians[0];

  return (
    <div className="space-y-3" data-testid="student-panel">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={`${student.firstName} ${student.lastName}`} className="size-10 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
            {student.firstName} {student.lastName}
            {student.status !== "ACTIVE" && <Badge tone={student.status === "PAUSED" ? "warn" : "neutral"}>{student.status.toLowerCase()}</Badge>}
            {student.archivedAt && <Badge>archived</Badge>}
          </h2>
          <p className="text-sm text-muted">{[student.grade && `Grade ${student.grade}`, student.schoolName, student.defaultSubject].filter(Boolean).join(" · ") || "No grade or subject yet"}</p>
        </div>
        <Link href={`/students/${student.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-3 hover:text-fg"><ExternalLink className="size-4" aria-hidden />Full page</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {session.role !== "ACCOUNTANT" && <LinkButton href={`/lessons/new?student=${student.id}&returnTo=${back}`} variant="primary"><CalendarPlus aria-hidden />New lesson</LinkButton>}
        {needNote[0] && <LinkButton href={`/lessons/${needNote[0].lesson.id}?returnTo=${back}#notes`} variant="secondary" title={`${needNote.length} lesson${needNote.length === 1 ? "" : "s"} from the last 30 days without a session note`}><NotebookPen aria-hidden />Write the note{needNote.length > 1 ? ` (${needNote.length} owed)` : ""}</LinkButton>}
        <LinkButton href={`/homework?student=${student.id}`} variant="secondary"><BookOpenCheck aria-hidden />Homework</LinkButton>
        {session.role !== "ACCOUNTANT" && <LinkButton href={`/students/${student.id}/edit`} variant="secondary"><Pencil aria-hidden />Edit</LinkButton>}
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
        </Card>

        <Card className="p-4 sm:p-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Column title="Session notes" action={notes.length > 0 ? <Link href={`/students/${student.id}#notes`} className="text-xs text-brand hover:underline">All</Link> : undefined}>
              {notes.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
                <ul className="space-y-2 text-sm">
                  {notes.slice(0, 3).map((n) => (
                    <li key={n.id}>
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted"><span className="tabular-nums">{formatDate(n.lesson.startsAt)}</span><span>{n.lesson.subject}</span>{n.engagement && <span>{n.engagement}/5</span>}<span>{n.sharedAt ? "sent" : "not sent"}</span></div>
                      <p className="leading-snug">{n.covered}</p>
                      {n.nextGoal && <p className="text-xs text-muted">Next: {n.nextGoal}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Column>
            <Column title={`Homework${openHomework.length ? ` · ${openHomework.length} open` : ""}`} action={<Link href={`/homework?student=${student.id}`} className="text-xs text-brand hover:underline">All</Link>}>
              {student.assignments.length === 0 ? <p className="text-sm text-muted">Nothing assigned.</p> : (
                <ul className="space-y-1 text-sm">
                  {student.assignments.slice(0, 4).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                      <Link href={`/homework/${a.id}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{a.title}</Link>
                      <Badge tone={a.status === "REVIEWED" ? "credit" : a.status === "OVERDUE" ? "owed" : a.status === "SOLVED" ? "brand" : "neutral"}>{a.status.toLowerCase()}</Badge>
                      <span className="text-xs text-muted tabular-nums">{a.dueOn ? `due ${formatDate(a.dueOn)}` : ""}{a._count.submissions > 0 ? ` · ${a._count.submissions} submitted` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Column>
          </div>
        </Card>

        <Card className="p-4 sm:p-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Column title="Contacts">
              {student.account.guardians.length === 0 && !student.email ? <p className="text-sm text-muted">None on file.</p> : (
                <div className="space-y-0.5 text-sm">
                  {primary && <p>{primary.name}{primary.relationship && <span className="text-muted"> · {primary.relationship}</span>}<span className="block text-xs text-muted">{[primary.email, primary.phone].filter(Boolean).join(" · ")}</span></p>}
                  {student.email && <p className="text-xs text-muted">Student: {[student.email, student.phone].filter(Boolean).join(" · ")}</p>}
                  {student.account.guardians.length > 1 && <p className="text-xs text-muted">{student.account.guardians.length - 1} more on the <Link href={`/accounts/${student.accountId}`} className="text-brand hover:underline">account</Link>.</p>}
                </div>
              )}
            </Column>
            {money ? (
              <Column title="Account">
                <p className="text-sm"><Link href={`/accounts/${student.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{student.account.name}</Link>{student.account.students.length > 1 && <span className="text-muted"> · {student.account.students.map((s) => s.firstName).join(", ")}</span>}</p>
                <p className="mt-0.5 text-sm"><Balance cents={balance} className="font-semibold" />{student.defaultPriceCents != null && <span className="text-xs text-muted"> · usual price {formatCents(student.defaultPriceCents)}</span>}</p>
              </Column>
            ) : (
              <Column title="Notes">
                {student.difficulties || student.notes ? (
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
