import Link from "next/link";
import { redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { localDateStr } from "@/src/lib/tz";
import { tutorMonth } from "@/src/services/payroll";
import { Badge, Card, Empty, Input, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My pay" };

/** A tutor's own earnings page, so nobody has to ask. Owners see every tutor under Reports. */
export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await requireSession();
  if (s.role !== "TUTOR") redirect("/reports/payroll");
  const q = await searchParams;
  const thisMonth = localDateStr(new Date(), s.timezone).slice(0, 7);
  const month = q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? q.month : thisMonth;
  if (!s.tutorId) {
    return (
      <div className="space-y-6">
        <PageHeader title="My pay" />
        <Empty>Your login is not linked to a tutor yet. Ask the owner to link it under Settings, Team.</Empty>
      </div>
    );
  }
  const m = await tutorMonth(prisma, s.organizationId, s.tutorId, month);
  return (
    <div className="space-y-6">
      <PageHeader title="My pay" subtitle={`${m.label} · ${m.rateLabel}`}
        actions={<form method="get" className="flex items-center gap-2"><Input type="month" name="month" defaultValue={month} aria-label="Month" className="w-44" /><button className="h-9 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-surface-2">Show</button></form>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lessons" value={m.lessons.length} tone="muted" />
        <Stat label="Hours" value={(m.minutes / 60).toFixed(1)} tone="muted" />
        <Stat label="Pay" value={m.payCents == null ? "rate not set" : formatCents(m.payCents)} tone="credit" />
        <Stat label="Paid out" value={m.recorded ? formatDate(m.recorded.spentOn) : "not yet"} tone="muted" />
      </div>
      <Card title="Lessons" actions={<a href={`/api/tutors/${s.tutorId}/slip?month=${month}`} className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"><FileDown className="size-4" aria-hidden />Pay slip (PDF)</a>}>
        {m.lessons.length === 0 ? <Empty>No lessons in {m.label}.</Empty> : (
          <TableWrap>
            <Table data-testid="earnings">
              <thead><tr><Th>Date</Th><Th>Students</Th><Th className="hidden sm:table-cell">Subject</Th><Th right>Minutes</Th><Th className="hidden sm:table-cell">Basis</Th><Th right>Pay</Th></tr></thead>
              <tbody>
                {m.lessons.map((l, i) => (
                  <tr key={i}>
                    <Td num>{l.date} {l.time}</Td>
                    <Td>{l.students}</Td>
                    <Td className="hidden sm:table-cell">{l.subject}</Td>
                    <Td right num>{l.minutes}</Td>
                    <Td className="hidden text-muted sm:table-cell">{l.basis}</Td>
                    <Td right num>{l.payCents == null ? <Badge tone="warn">no rule</Badge> : formatCents(l.payCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <p className="mt-3 text-xs text-muted">Cancelled lessons are not counted. Questions about a rate go to the owner. Your <Link href="/calendar" className="text-brand hover:underline">calendar</Link> shows what is coming.</p>
      </Card>
    </div>
  );
}
