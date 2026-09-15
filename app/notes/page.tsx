import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { formatDate, formatWhen } from "@/src/lib/format";
import { localDateStr } from "@/src/lib/tz";
import { lessonsMissingNotes, recentSessionNotes } from "@/src/services/sessionNotes";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/src/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session notes" };

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Session notes in one place: the lessons still waiting for one, and the notes written lately. A tutor sees their own. */
export default async function NotesPage() {
  const s = await requireSession();
  const scope = tutorScope(s);
  const today = localDateStr(new Date(), s.timezone);
  const [missing, recent] = await Promise.all([
    lessonsMissingNotes(prisma, s.organizationId, { from: addDays(today, -14), to: addDays(today, 1), timeZone: s.timezone, tutorId: scope }),
    recentSessionNotes(prisma, s.organizationId, { tutorId: scope, userId: s.userId, take: 40 }),
  ]);
  const owed = missing.reduce((n, l) => n + l.students.length, 0);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Session notes"
        subtitle="What was covered, a win, a struggle, homework, and the next goal. One note per student per lesson, or a general one. Sent to the family by hand or by the nightly job."
        actions={s.role !== "ACCOUNTANT" && <LinkButton href="/notes/new?returnTo=%2Fnotes" variant="primary"><Plus aria-hidden />New note</LinkButton>}
      />
      <Card title={<span className="inline-flex items-center gap-2"><NotebookPen className="size-4 text-brand" aria-hidden />Still to write ({owed})</span>}>
        {missing.length === 0 ? <Empty>Every lesson from the last two weeks has its note.</Empty> : (
          <ul className="divide-y divide-line text-sm" data-testid="notes-to-write">
            {missing.map((l) => (
              <li key={l.lessonId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-44 shrink-0 tabular-nums text-muted">{formatWhen(l.startsAt, s.timezone)}</span>
                <span className="min-w-0 flex-1">{l.subject}{!scope && l.tutor && <span className="text-muted"> · {l.tutor}</span>}</span>
                <span className="flex flex-wrap gap-x-3">
                  {l.students.map((x) => <Link key={x.id} href={`/notes/new?lesson=${l.lessonId}&student=${x.id}&returnTo=%2Fnotes`} className="text-brand hover:underline">{x.name}</Link>)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Completed lessons from the last two weeks with a student and no note yet.</p>
      </Card>
      <Card title={`Written lately (${recent.length})`}>
        {recent.length === 0 ? <Empty>No notes yet.</Empty> : (
          <ul className="divide-y divide-line text-sm" data-testid="recent-notes">
            {recent.map((n) => (
              <li key={n.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={`/notes/${n.id}?returnTo=%2Fnotes`} className="w-44 shrink-0 tabular-nums text-muted hover:text-brand hover:underline">{n.lesson ? formatWhen(n.lesson.startsAt, s.timezone) : formatDate(n.notedOn)}</Link>
                  <Link href={`/students?s=${n.student.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{n.student.firstName} {n.student.lastName}</Link>
                  <span className="text-muted">{n.lesson ? `${n.lesson.subject}${!scope && n.lesson.tutor ? ` · ${n.lesson.tutor.name}` : ""}` : "general note"}</span>
                  {n.engagement && <Badge tone={n.engagement >= 4 ? "credit" : n.engagement <= 2 ? "owed" : "neutral"}>engagement {n.engagement}/5</Badge>}
                  <span className="text-xs text-muted">{n.sharedAt ? `sent ${formatDate(n.sharedAt)}` : "not sent"}</span>
                </div>
                <p className="mt-1">{n.covered}</p>
                {(n.win || n.struggle || n.nextGoal) && <p className="mt-0.5 text-muted">{[n.win && `Win: ${n.win}`, n.struggle && `Struggle: ${n.struggle}`, n.nextGoal && `Next: ${n.nextGoal}`].filter(Boolean).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
