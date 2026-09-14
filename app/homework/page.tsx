import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatDate } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { listAssignments, type EffectiveStatus } from "@/src/services/homework";
import { listLibrary } from "@/src/services/files";
import { Plus } from "lucide-react";
import { Badge, Button, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { ArchiveOlder, ArchiveSelected } from "./ArchiveForms";
import { toggleArchiveAction } from "./actions";
import { NewAssignmentForm } from "./NewAssignmentForm";

export const dynamic = "force-dynamic";

const TONE: Record<EffectiveStatus, "neutral" | "brand" | "owed" | "credit" | "warn"> = { PENDING: "neutral", ASSIGNED: "brand", SOLVED: "warn", REVIEWED: "credit", OVERDUE: "owed" };

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ status?: string; student?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const today = localDateOnly(new Date(), s.timezone);
  const archived = q.status === "ARCHIVED";
  const filter = (["OPEN", "PENDING", "ASSIGNED", "SOLVED", "REVIEWED", "OVERDUE"] as const).includes(q.status as never) ? (q.status as EffectiveStatus | "OPEN") : "OPEN";
  const [rows, students, library] = await Promise.all([
    listAssignments(prisma, s.organizationId, { today, status: archived ? undefined : filter, studentId: q.student, archived }),
    prisma.student.findMany({ where: { organizationId: s.organizationId, deletedAt: null, archivedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    listLibrary(prisma, s.organizationId),
  ]);
  const tabs: [string, string][] = [["OPEN", "Open"], ["SOLVED", "To review"], ["OVERDUE", "Overdue"], ["ASSIGNED", "Assigned"], ["PENDING", "Not sent"], ["REVIEWED", "Reviewed"], ["ARCHIVED", "Archived"]];
  const current = archived ? "ARCHIVED" : filter;
  const canEdit = s.role !== "ACCOUNTANT";
  const monthAgo = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const table = (withBoxes: boolean) => (
    <TableWrap>
      <Table data-testid="assignments">
        <thead><tr>{withBoxes && <Th className="w-8"><span className="sr-only">Pick</span></Th>}<Th>Student</Th><Th>Title</Th><Th>Due</Th><Th>Status</Th><Th right>Submitted</Th>{archived && canEdit && <Th></Th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2">
              {withBoxes && <Td><input type="checkbox" name="assignmentId" value={r.id} className="mt-0.5 size-4 accent-brand" aria-label={`Pick ${r.title}`} /></Td>}
              <Td><Link href={`/students/${r.studentId}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{r.studentName}</Link></Td>
              <Td><Link href={`/homework/${r.id}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{r.title || <span className="text-muted">Untitled</span>}</Link></Td>
              <Td num>{r.dueOn ? formatDate(r.dueOn) : <span className="text-muted">none</span>}</Td>
              <Td><Badge tone={TONE[r.status]}>{r.status === "SOLVED" ? "to review" : r.status.toLowerCase()}</Badge></Td>
              <Td right num>{r.submissions}</Td>
              {archived && canEdit && (
                <Td right>
                  <form action={toggleArchiveAction}><input type="hidden" name="assignmentId" value={r.id} /><input type="hidden" name="archived" value="1" /><Button variant="link" className="text-xs">Unarchive</Button></form>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Homework" subtitle={`${rows.length} ${archived ? "archived" : "shown"}`} actions={<LinkButton href="/library" variant="secondary">Library</LinkButton>} />
      {canEdit && (
        <details className="group rounded-xl border border-line bg-surface shadow-xs [&[open]>summary]:border-b [&[open]>summary]:border-line" open={!!q.student}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[15px] font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
            <Plus className="size-4 text-brand transition-transform group-open:rotate-45" aria-hidden />
            New assignment
          </summary>
          <div className="p-4 sm:p-5">
            <NewAssignmentForm students={students.map((st) => ({ id: st.id, name: `${st.lastName}, ${st.firstName}` }))} library={library.map((l) => ({ id: l.fileId, name: l.name, folder: l.folder }))} defaultStudentId={q.student} />
          </div>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter">
          {tabs.map(([v, label]) => (
            <Link key={v} href={`/homework?status=${v}${q.student ? `&student=${q.student}` : ""}`} aria-current={current === v ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${current === v ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>{label}</Link>
          ))}
        </nav>
        {canEdit && !archived && <ArchiveOlder defaultBefore={monthAgo} />}
      </div>
      <Card>
        {rows.length === 0 ? <Empty>{archived ? "Nothing archived." : "Nothing here."}</Empty> : canEdit && !archived ? <ArchiveSelected>{table(true)}</ArchiveSelected> : table(false)}
      </Card>
    </div>
  );
}
