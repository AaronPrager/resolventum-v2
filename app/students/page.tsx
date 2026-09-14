import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatDay } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { listStudents } from "@/src/services/students";
import { Badge, Balance, Card, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const q = await searchParams;
  const includeArchived = q.archived === "1";
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const rows = await listStudents(prisma, org.id, localDateOnly(new Date(), session.timezone), { includeArchived });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle={`${rows.length} students. Balance is the account's, so siblings share one.`}
        actions={<LinkButton href={includeArchived ? "/students" : "/students?archived=1"} variant="secondary">{includeArchived ? "Hide archived" : "Show archived"}</LinkButton>}
      />
      <Card>
        <TableWrap>
          <Table data-testid="students">
            <thead><tr><Th>Student</Th><Th className="hidden sm:table-cell">Grade</Th><Th className="hidden md:table-cell">Last lesson</Th><Th>Next lesson</Th><Th right className="hidden sm:table-cell">Lessons</Th><Th right>Balance</Th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={`hover:bg-surface-2 ${s.archived ? "text-muted" : ""}`}>
                  <Td><Link href={`/students/${s.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{s.name}</Link>{s.archived && <Badge>archived</Badge>}</Td>
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
