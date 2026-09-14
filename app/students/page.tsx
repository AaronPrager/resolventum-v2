import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { formatDay } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { listStudents } from "@/src/services/students";
import { Badge, Balance, Card, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ archived?: string; status?: string }> }) {
  const q = await searchParams;
  const includeArchived = q.archived === "1";
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const all = await listStudents(prisma, org.id, localDateOnly(new Date(), session.timezone), { includeArchived, tutorId: tutorScope(session) });
  const status = q.status === "PAUSED" || q.status === "GRADUATED" || q.status === "ACTIVE" ? q.status : null;
  const rows = status ? all.filter((r) => r.status === status) : all;
  const counts = { ACTIVE: all.filter((r) => r.status === "ACTIVE" && !r.archived).length, PAUSED: all.filter((r) => r.status === "PAUSED").length, GRADUATED: all.filter((r) => r.status === "GRADUATED").length };
  const mine = session.role === "TUTOR" && session.tutorId;
  return (
    <div className="space-y-6">
      <PageHeader
        title={mine ? "My students" : "Students"}
        subtitle={`${counts.ACTIVE} active${counts.PAUSED ? `, ${counts.PAUSED} paused` : ""}${counts.GRADUATED ? `, ${counts.GRADUATED} graduated` : ""}. Balance is the account's, so siblings share one.`}
        actions={<>
          {(counts.PAUSED > 0 || counts.GRADUATED > 0 || status) && (
            <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Status">
              {([["", "All"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["GRADUATED", "Graduated"]] as const).map(([v, label]) => (
                <Link key={v} href={`/students?${[includeArchived ? "archived=1" : "", v ? `status=${v}` : ""].filter(Boolean).join("&")}`} aria-current={(status ?? "") === v ? "page" : undefined} className={`inline-flex h-8 items-center rounded-md px-3 text-sm ${(status ?? "") === v ? "bg-surface font-medium text-fg shadow-xs" : "text-muted hover:text-fg"}`}>{label}</Link>
              ))}
            </div>
          )}
          <LinkButton href={includeArchived ? "/students" : "/students?archived=1"} variant="secondary">{includeArchived ? "Hide archived" : "Show archived"}</LinkButton>
          {!mine && <a href="/api/export?what=students" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every student as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>}
          {session.role !== "ACCOUNTANT" && <LinkButton href="/students/new" variant="primary"><Plus aria-hidden />Add student</LinkButton>}
        </>}
      />
      <Card>
        <TableWrap>
          <Table data-testid="students">
            <thead><tr><Th>Student</Th><Th className="hidden sm:table-cell">Grade</Th><Th className="hidden md:table-cell">Last lesson</Th><Th>Next lesson</Th><Th right className="hidden sm:table-cell">Lessons</Th><Th right>Balance</Th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={`hover:bg-surface-2 ${s.archived ? "text-muted" : ""}`}>
                  <Td><Link href={`/students/${s.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{s.name}</Link>{s.status !== "ACTIVE" && <span className="ml-2"><Badge tone={s.status === "PAUSED" ? "warn" : "neutral"}>{s.status.toLowerCase()}</Badge></span>}{s.archived && <span className="ml-2"><Badge>archived</Badge></span>}</Td>
                  <Td className="hidden sm:table-cell">{s.grade ?? ""}</Td>
                  <Td className="hidden md:table-cell">{s.lastLessonAt ? formatDay(s.lastLessonAt, org.timezone) : ""}</Td>
                  <Td>{s.nextLessonAt ? formatDay(s.nextLessonAt, org.timezone) : <span className="text-muted">none</span>}</Td>
                  <Td right num className="hidden sm:table-cell">{s.lessonCount}</Td>
                  <Td right num><Link href={`/accounts/${s.accountId}`} className="hover:underline"><Balance cents={s.balanceCents} /></Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
