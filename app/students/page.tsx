import Link from "next/link";
import { redirect } from "next/navigation";
import { FileDown, Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { formatDate } from "@/src/lib/format";
import { archiveCandidates, listStudents } from "@/src/services/students";
import { Badge, Balance, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { RowLinks } from "@/src/components/RowLinks";
import { RowActions } from "./RowActions";

export const dynamic = "force-dynamic";

/**
 * Every student as a sortable table, on the books or archived, one tab each.
 * A row opens the student's page. ?quiet=1 narrows to the dashboard's
 * "nothing going on" students.
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ status?: string; quiet?: string; s?: string }> }) {
  const q = await searchParams;
  if (q.s) redirect(`/students/${q.s}`); // the old way of picking a student
  const session = await requireSession();
  const [all, quietRows] = await Promise.all([
    listStudents(prisma, session.organizationId, localDateOnly(new Date(), session.organizationTimezone), { includeArchived: true, tutorId: tutorScope(session) }),
    archiveCandidates(prisma, session.organizationId),
  ]);
  const archived = q.status === "ARCHIVED";
  const quiet = q.quiet === "1" && !archived;
  const quietIds = new Set(quietRows.map((r) => r.id));
  const rows = all.filter((r) => r.archived === archived && (!quiet || quietIds.has(r.id)));
  const counts = { onBooks: all.filter((r) => !r.archived).length, paused: all.filter((r) => !r.archived && r.status === "PAUSED").length, archived: all.filter((r) => r.archived).length };
  const mine = session.role === "TUTOR" && session.tutorId;
  const money = session.role !== "TUTOR";
  const tabs: [string, string][] = [["", `Active${counts.onBooks ? ` (${counts.onBooks})` : ""}`], ["ARCHIVED", `Archived${counts.archived ? ` (${counts.archived})` : ""}`]];

  return (
    <div className="space-y-5">
      <PageHeader
        title={mine ? "My students" : "Students"}
        subtitle={`${counts.onBooks - counts.paused} active${counts.paused ? `, ${counts.paused} paused` : ""}${counts.archived ? `, ${counts.archived} archived` : ""}${money ? ". Balance is the account's, so siblings share one." : ""}`}
        actions={<>
          <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Which students">
            {tabs.map(([v, label]) => (
              <Link key={v} href={`/students${v ? `?status=${v}` : ""}`} aria-current={(archived ? "ARCHIVED" : "") === v ? "page" : undefined} className={`inline-flex h-8 items-center rounded-md px-3 text-sm ${(archived ? "ARCHIVED" : "") === v ? "bg-surface font-medium text-fg shadow-xs" : "text-muted hover:text-fg"}`}>{label}</Link>
            ))}
          </div>
          {!mine && <a href="/api/export?what=students" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every student as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>}
          {session.role !== "ACCOUNTANT" && <LinkButton href="/students/new" variant="primary"><Plus aria-hidden />Add student</LinkButton>}
        </>}
      />

      {quiet && (
        <p className="text-sm text-muted" data-testid="quiet-note">Showing the {rows.length} student{rows.length === 1 ? "" : "s"} with no lesson in 60 days and nothing booked. <Link href="/students" className="text-brand hover:underline">Show everyone</Link></p>
      )}

      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-4"><Empty>{quiet ? "Nobody is quiet. Every active student has had a lesson lately or has one booked." : archived ? "Nothing archived." : "No students yet."}</Empty></div>
        ) : (
          <RowLinks>
            <TableWrap>
              <Table data-testid="students">
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th className="hidden sm:table-cell">Grade</Th>
                    <Th>Status</Th>
                    <Th className="hidden md:table-cell">Last lesson</Th>
                    <Th className="hidden md:table-cell">Next lesson</Th>
                    <Th right className="hidden lg:table-cell">Lessons</Th>
                    {money && <Th right>Balance</Th>}
                    {money && <Th className="hidden lg:table-cell">Account</Th>}
                    {session.role !== "ACCOUNTANT" && <Th right><span className="sr-only">Actions</span></Th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-href={`/students/${r.id}`} className="hover:bg-surface-2">
                      <Td className="whitespace-nowrap"><Link href={`/students/${r.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{r.name}</Link></Td>
                      <Td className="hidden sm:table-cell">{r.grade ?? ""}</Td>
                      <Td>{r.archived ? <Badge>archived</Badge> : r.status === "PAUSED" ? <Badge tone="warn">paused</Badge> : quietIds.has(r.id) ? <Badge tone="neutral">quiet</Badge> : <Badge tone="credit">active</Badge>}</Td>
                      <Td num className="hidden md:table-cell">{r.lastLessonAt ? formatDate(r.lastLessonAt) : <span className="text-muted">none</span>}</Td>
                      <Td num className="hidden md:table-cell">{r.nextLessonAt ? formatDate(r.nextLessonAt) : <span className="text-muted">none</span>}</Td>
                      <Td right num className="hidden lg:table-cell">{r.lessonCount}</Td>
                      {money && <Td right num><Balance cents={r.balanceCents} /></Td>}
                      {money && <Td className="hidden whitespace-nowrap lg:table-cell"><Link href={`/accounts/${r.accountId}`} className="text-muted underline-offset-2 hover:text-brand hover:underline">{r.accountName}</Link></Td>}
                      {session.role !== "ACCOUNTANT" && <Td right><RowActions id={r.id} first={r.name.split(" ")[0]} archived={r.archived} listHref={archived ? "/students?status=ARCHIVED" : "/students"} /></Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </RowLinks>
        )}
      </Card>
    </div>
  );
}
