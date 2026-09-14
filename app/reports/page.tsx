import Link from "next/link";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { dateOnlyFromStr, localDateOnly } from "@/src/lib/tz";
import { incomeByKind, monthlyReport, studentsByRevenue, tutorPay, yearSummary } from "@/src/services/reports";
import { accountBalances } from "@/src/services/balances";
import { Balance, Card, Empty, LinkButton, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const s = await requireMoney();
  const q = await searchParams;
  const year = q.year && /^\d{4}$/.test(q.year) ? Number(q.year) : new Date().getFullYear();
  const now = new Date();
  const [y, months, students, tutors, balances, income] = await Promise.all([
    yearSummary(prisma, s.organizationId, year, localDateOnly(now, s.timezone)),
    monthlyReport(prisma, s.organizationId, year),
    studentsByRevenue(prisma, s.organizationId, year),
    tutorPay(prisma, s.organizationId, dateOnlyFromStr(`${year}-01-01`), dateOnlyFromStr(`${year + 1}-01-01`)),
    accountBalances(prisma, s.organizationId, localDateOnly(now, s.timezone)),
    incomeByKind(prisma, s.organizationId, year),
  ]);
  const owing = balances.filter((b) => b.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents);
  const maxPaid = Math.max(1, ...months.map((m) => m.paidCents));

  return (
    <div className="space-y-6">
      <PageHeader title={`Reports ${year}`} subtitle="Money in, lessons taught, and what is still owed. Everything here is derived from the ledger."
        actions={<><LinkButton href={`/reports?year=${year - 1}`} variant="secondary">{year - 1}</LinkButton><LinkButton href={`/reports?year=${year + 1}`} variant="secondary">{year + 1}</LinkButton><LinkButton href={`/expenses/tax?year=${year}`} variant="secondary">Tax summary</LinkButton></>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Received" value={formatCents(y.receivedCents)} tone="credit" data-testid="received" />
        <Stat label="Refunded" value={formatCents(y.refundedCents)} tone={y.refundedCents ? "owed" : "muted"} />
        <Stat label="Deductible expenses" value={formatCents(y.deductibleCents)} />
        <Stat label="Profit before tax" value={formatCents(y.profitCents)} tone={y.profitCents >= 0 ? "credit" : "owed"} />
        <Stat label="Lessons" value={y.lessons} tone="muted" />
        <Stat label="Hours" value={y.hours} tone="muted" />
        <Stat label="Students taught" value={y.activeStudents} tone="muted" />
        <Stat label="Average lesson" value={formatCents(y.averageLessonCents)} tone="muted" />
      </div>

      <Card title="Where the money came from" actions={<span className="text-xs text-muted">Money received in {year}, by what it paid for</span>}>
        <TableWrap><Table data-testid="income-by-kind">
          <tbody>
            {([
              ...income.lessonsByCategory.map((c) => [`${c.name} lessons`, c.cents] as [string, number]),
              [income.lessonsByCategory.length ? "Lessons with no category" : "Lessons", income.uncategorizedLessonsCents],
              ["Fees", income.feesCents],
              ["Tips", income.tipsCents],
              ["Other charges", income.otherChargesCents],
              ["Not applied yet (credit on accounts)", income.unappliedCents],
            ] as [string, number][]).filter(([, c]) => c !== 0).map(([label, cents]) => (
              <tr key={label}><Td>{label}</Td><Td right num>{formatCents(cents)}</Td><Td right num className="w-20 text-muted">{income.receivedCents ? `${Math.round((cents / income.receivedCents) * 100)}%` : ""}</Td></tr>
            ))}
            <tr><Td className="font-semibold">Received</Td><Td right num className="font-semibold">{formatCents(income.receivedCents)}</Td><Td /></tr>
            {income.refundsCents > 0 && <tr><Td className="text-muted">Refunds given</Td><Td right num className="text-owed">−{formatCents(income.refundsCents)}</Td><Td /></tr>}
          </tbody>
        </Table></TableWrap>
        <p className="mt-2 text-xs text-muted">Lessons are grouped by the categories under Office. Lessons without one land in &quot;no category&quot;.</p>
      </Card>

      <Card title="Month by month">
        <TableWrap><Table data-testid="months">
          <thead><tr><Th>Month</Th><Th right>Received</Th><Th right className="hidden sm:table-cell">Lessons</Th><Th right className="hidden sm:table-cell">Charged</Th><Th right>Expenses</Th><Th className="hidden md:table-cell"></Th></tr></thead>
          <tbody>{months.map((m, i) => (
            <tr key={m.month} className="hover:bg-surface-2">
              <Td>{MONTHS[i]}</Td>
              <Td right num>{formatCents(m.paidCents)}{m.refundedCents > 0 && <span className="text-xs text-owed"> −{formatCents(m.refundedCents)}</span>}</Td>
              <Td right num className="hidden sm:table-cell">{m.lessons}</Td>
              <Td right num className="hidden sm:table-cell">{formatCents(m.chargedCents)}</Td>
              <Td right num>{formatCents(m.expenseCents)}</Td>
              <Td className="hidden w-40 md:table-cell"><div className="h-2 rounded bg-brand/70" style={{ width: `${Math.round((m.paidCents / maxPaid) * 100)}%` }} /></Td>
            </tr>
          ))}</tbody>
        </Table></TableWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Owed to you now (${owing.length})`}>
          {owing.length === 0 ? <Empty>Nobody owes anything.</Empty> : (
            <TableWrap><Table>
              <thead><tr><Th>Account</Th><Th right>Balance</Th></tr></thead>
              <tbody>{owing.map((b) => <tr key={b.accountId} className="hover:bg-surface-2"><Td><Link href={`/accounts/${b.accountId}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{b.name}</Link></Td><Td right num><Balance cents={b.balanceCents} /></Td></tr>)}</tbody>
            </Table></TableWrap>
          )}
          <p className="mt-2 text-xs text-muted">Total {formatCents(y.outstandingCents)}. Credit held {formatCents(y.creditHeldCents)}.</p>
        </Card>
        <Card title="Students by revenue">
          {students.length === 0 ? <Empty>No lessons in {year}.</Empty> : (
            <TableWrap><Table>
              <thead><tr><Th>Student</Th><Th right>Lessons</Th><Th right>Hours</Th><Th right>Charged</Th></tr></thead>
              <tbody>{students.slice(0, 25).map((r) => <tr key={r.studentId} className="hover:bg-surface-2"><Td><Link href={`/students/${r.studentId}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{r.name}</Link></Td><Td right num>{r.lessons}</Td><Td right num>{(r.minutes / 60).toFixed(1)}</Td><Td right num>{formatCents(r.chargedCents)}</Td></tr>)}</tbody>
            </Table></TableWrap>
          )}
        </Card>
      </div>

      <Card title="Tutors" actions={<Link href="/reports/payroll" className="text-sm text-brand hover:underline">Monthly pay and slips</Link>}>
        <TableWrap><Table>
          <thead><tr><Th>Tutor</Th><Th right>Lessons</Th><Th right>Hours</Th><Th right>Charged to families</Th><Th right>Pay</Th></tr></thead>
          <tbody>{tutors.map((t) => <tr key={t.tutorId}><Td>{t.tutorName}</Td><Td right num>{t.lessons}</Td><Td right num>{(t.minutes / 60).toFixed(1)}</Td><Td right num>{formatCents(t.chargedCents)}</Td><Td right num>{t.payCents == null ? <span className="text-muted">no rate set</span> : formatCents(t.payCents)}</Td></tr>)}</tbody>
        </Table></TableWrap>
        <p className="mt-2 text-xs text-muted">Pay is hours times the tutor's hourly rate. Lessons with no tutor assigned are not counted here.</p>
      </Card>
    </div>
  );
}
