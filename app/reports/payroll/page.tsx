import Link from "next/link";
import { FileDown } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { localDateStr } from "@/src/lib/tz";
import { tutorMonth } from "@/src/services/payroll";
import { Badge, Card, Empty, Input, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { RecordButton } from "./RecordButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutor pay" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const today = localDateStr(new Date(), s.timezone);
  const [y, m] = today.split("-").map(Number);
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const month = q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? q.month : lastMonth;
  const tutors = await prisma.tutor.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true } });
  const rows = await Promise.all(tutors.map((t) => tutorMonth(prisma, s.organizationId, t.id, month)));
  const total = rows.reduce((sum, r) => sum + (r.payCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor pay"
        back={{ href: "/reports", label: "Reports" }}
        subtitle={`${rows[0]?.label ?? month} · ${formatCents(total)} for ${rows.filter((r) => r.lessons.length).length} tutors`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <Input type="month" name="month" defaultValue={month} aria-label="Month" className="w-44" />
            <button className="h-9 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-surface-2">Show</button>
          </form>
        }
      />
      <Card>
        {rows.length === 0 ? <Empty>No tutors yet. Add them in <Link href="/settings/tutors" className="text-brand hover:underline">Settings</Link>.</Empty> : (
          <TableWrap>
            <Table data-testid="payroll">
              <thead><tr><Th>Tutor</Th><Th right>Lessons</Th><Th right>Hours</Th><Th right>Rate</Th><Th right>Pay</Th><Th>Expense</Th><Th></Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tutor.id}>
                    <Td className="font-medium">{r.tutor.name}</Td>
                    <Td right num>{r.lessons.length}</Td>
                    <Td right num>{(r.minutes / 60).toFixed(2)}</Td>
                    <Td right num>{r.rateCents == null ? <Link href="/settings/tutors" className="text-warn hover:underline">set a rate</Link> : formatCents(r.rateCents)}</Td>
                    <Td right num className="font-medium">{r.payCents == null ? "" : formatCents(r.payCents)}</Td>
                    <Td>{r.recorded ? <Link href={`/expenses/${r.recorded.id}`}><Badge tone="credit">recorded {formatDate(r.recorded.spentOn)}</Badge></Link> : <span className="text-muted">not yet</span>}</Td>
                    <Td right>
                      <div className="flex items-start justify-end gap-2">
                        <a href={`/api/tutors/${r.tutor.id}/slip?month=${month}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-3 hover:text-fg"><FileDown className="size-4" aria-hidden />Slip</a>
                        {s.role !== "ACCOUNTANT" && <RecordButton tutorId={r.tutor.id} month={month} disabled={!!r.recorded || !r.payCents} />}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <p className="mt-3 text-xs text-muted">Hours count every lesson with this tutor that was not cancelled. Recording makes one Contract Labor expense dated the last day of the month; void it on the expense page to redo it.</p>
      </Card>
    </div>
  );
}
