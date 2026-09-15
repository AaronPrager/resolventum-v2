import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { formatDate, formatWhen } from "@/src/lib/format";
import { localDateStr } from "@/src/lib/tz";
import { lessonsMissingNotes, recentSessionNotes } from "@/src/services/sessionNotes";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { RowLinks } from "@/src/components/RowLinks";
import { StudentFilter } from "@/src/components/StudentFilter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session notes" };

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Session notes as a table, newest first, with a tab for the lessons still
 * waiting for one and a student filter. A row opens the note. A tutor sees
 * their own.
 */
export default async function NotesPage({ searchParams }: { searchParams: Promise<{ tab?: string; student?: string }> }) {
  const q = await searchParams;
  const s = await requireSession();
  const scope = tutorScope(s);
  const today = localDateStr(new Date(), s.timezone);
  const todo = q.tab === "todo";
  const [missingAll, notes, students] = await Promise.all([
    lessonsMissingNotes(prisma, s.organizationId, { from: addDays(today, -14), to: addDays(today, 1), timeZone: s.timezone, tutorId: scope }),
    recentSessionNotes(prisma, s.organizationId, { tutorId: scope, userId: s.userId, studentId: q.student, take: 300 }),
    prisma.student.findMany({ where: { organizationId: s.organizationId, deletedAt: null, OR: [{ archivedAt: null }, { id: q.student ?? "" }] }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
  ]);
  const student = q.student && students.some((st) => st.id === q.student) ? q.student : "";
  const missing = student ? missingAll.map((l) => ({ ...l, students: l.students.filter((x) => x.id === student) })).filter((l) => l.students.length > 0) : missingAll;
  const owed = missing.reduce((n, l) => n + l.students.length, 0); // for the picked student when one is picked, like the Written count
  const canWrite = s.role !== "ACCOUNTANT";
  const tabs: [string, string][] = [["", `Written (${notes.length})`], ["todo", `To write (${owed})`]];
  const current = todo ? "todo" : "";
  const back = encodeURIComponent(`/notes${todo ? "?tab=todo" : ""}${student ? `${todo ? "&" : "?"}student=${student}` : ""}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session notes"
        subtitle="What was covered, a win, a struggle, homework, and the next goal. One note per student per lesson, or a general one. Sent to the family by hand or by the nightly job."
        actions={canWrite && <LinkButton href={`/notes/new?${student ? `student=${student}&` : ""}returnTo=${back}`} variant="primary"><Plus aria-hidden />New note</LinkButton>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter">
          {tabs.map(([v, label]) => (
            <Link key={v} href={`/notes${v ? `?tab=${v}` : ""}${student ? `${v ? "&" : "?"}student=${student}` : ""}`} aria-current={current === v ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${current === v ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>{label}</Link>
          ))}
        </nav>
        <StudentFilter students={students.map((st) => ({ id: st.id, name: `${st.firstName} ${st.lastName}` }))} selected={student} href={`/notes${todo ? "?tab=todo" : ""}`} />
      </div>

      {todo ? (
        <Card>
          {missing.length === 0 ? <Empty>Every lesson from the last two weeks has its note.</Empty> : (
            <TableWrap>
              <Table data-testid="notes-to-write">
                <thead><tr><Th>Lesson</Th><Th>Subject</Th>{!scope && <Th className="hidden sm:table-cell">Tutor</Th>}<Th>Write for</Th></tr></thead>
                <tbody>
                  {missing.map((l) => (
                    <tr key={l.lessonId} className="hover:bg-surface-2">
                      <Td num>{formatWhen(l.startsAt, s.timezone)}</Td>
                      <Td>{l.subject}</Td>
                      {!scope && <Td className="hidden sm:table-cell">{l.tutor ?? ""}</Td>}
                      <Td><span className="flex flex-wrap gap-x-3">{l.students.map((x) => <Link key={x.id} href={`/notes/new?lesson=${l.lessonId}&student=${x.id}&returnTo=${back}`} className="text-brand hover:underline">{x.name}</Link>)}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-muted">Completed lessons from the last two weeks with a student and no note yet.</p>
        </Card>
      ) : (
        <Card>
          {notes.length === 0 ? <Empty>No notes yet.</Empty> : (
            <RowLinks>
              <TableWrap>
                <Table data-testid="recent-notes">
                  <thead><tr><Th>Student</Th><Th>Date</Th><Th>About</Th><Th className="hidden md:table-cell">Covered</Th><Th className="hidden sm:table-cell">Engagement</Th><Th>Sent</Th></tr></thead>
                  <tbody>
                    {notes.map((n) => (
                      <tr key={n.id} data-href={`/notes/${n.id}?returnTo=${back}`} className="hover:bg-surface-2">
                        <Td className="whitespace-nowrap"><Link href={`/students/${n.student.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{n.student.firstName} {n.student.lastName}</Link></Td>
                        <Td num className="whitespace-nowrap"><Link href={`/notes/${n.id}?returnTo=${back}`} className="underline-offset-2 hover:text-brand hover:underline">{n.lesson ? formatWhen(n.lesson.startsAt, s.timezone) : formatDate(n.notedOn)}</Link></Td>
                        <Td>{n.lesson ? `${n.lesson.subject || "Lesson"}${!scope && n.lesson.tutor ? ` · ${n.lesson.tutor.name}` : ""}` : <span className="text-muted">general</span>}</Td>
                        <Td className="hidden max-w-md truncate md:table-cell" title={n.covered}>{n.covered}</Td>
                        <Td className="hidden sm:table-cell" data-sort={n.engagement ?? ""}>{n.engagement ? <Badge tone={n.engagement >= 4 ? "credit" : n.engagement <= 2 ? "owed" : "neutral"}>{n.engagement}/5</Badge> : ""}</Td>
                        <Td num className="whitespace-nowrap">{n.sharedAt ? formatDate(n.sharedAt) : <span className="text-muted">not sent</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </RowLinks>
          )}
        </Card>
      )}
    </div>
  );
}
