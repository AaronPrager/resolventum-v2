import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatDate } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { listAssignments, type EffectiveStatus } from "@/src/services/homework";
import { listLibrary } from "@/src/services/files";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { NewAssignmentForm } from "./NewAssignmentForm";

export const dynamic = "force-dynamic";

const TONE: Record<EffectiveStatus, "neutral" | "brand" | "owed" | "credit" | "warn"> = { PENDING: "neutral", ASSIGNED: "brand", SOLVED: "warn", REVIEWED: "credit", OVERDUE: "owed" };

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ status?: string; student?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const today = localDateOnly(new Date(), s.timezone);
  const filter = (["OPEN", "PENDING", "ASSIGNED", "SOLVED", "REVIEWED", "OVERDUE"] as const).includes(q.status as never) ? (q.status as EffectiveStatus | "OPEN") : "OPEN";
  const [rows, students, library] = await Promise.all([
    listAssignments(prisma, s.organizationId, { today, status: filter, studentId: q.student }),
    prisma.student.findMany({ where: { organizationId: s.organizationId, deletedAt: null, archivedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    listLibrary(prisma, s.organizationId),
  ]);
  const tabs: [string, string][] = [["OPEN", "Open"], ["SOLVED", "To review"], ["OVERDUE", "Overdue"], ["ASSIGNED", "Assigned"], ["PENDING", "Not sent"], ["REVIEWED", "Reviewed"]];
  return (
    <div className="space-y-6">
      <PageHeader title="Homework" subtitle={`${rows.length} shown`} actions={<LinkButton href="/library" variant="secondary">Library</LinkButton>} />
      <Card title="New assignment">
        <NewAssignmentForm students={students.map((st) => ({ id: st.id, name: `${st.lastName}, ${st.firstName}` }))} library={library.map((l) => ({ id: l.fileId, name: l.name, folder: l.folder }))} defaultStudentId={q.student} />
      </Card>
      <div className="flex flex-wrap gap-2 text-sm">
        {tabs.map(([v, label]) => (
          <Link key={v} href={`/homework?status=${v}${q.student ? `&student=${q.student}` : ""}`} className={`rounded-md px-3 py-1.5 ${filter === v ? "bg-brand-soft font-medium text-brand" : "border border-line hover:bg-surface-3"}`}>{label}</Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? <Empty>Nothing here.</Empty> : (
          <TableWrap>
            <Table data-testid="assignments">
              <thead><tr><Th>Student</Th><Th>Title</Th><Th>Due</Th><Th>Status</Th><Th right>Submitted</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <Td><Link href={`/students/${r.studentId}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{r.studentName}</Link></Td>
                    <Td><Link href={`/homework/${r.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{r.title}</Link></Td>
                    <Td num>{r.dueOn ? formatDate(r.dueOn) : <span className="text-muted">none</span>}</Td>
                    <Td><Badge tone={TONE[r.status]}>{r.status === "SOLVED" ? "to review" : r.status.toLowerCase()}</Badge></Td>
                    <Td right num>{r.submissions}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
