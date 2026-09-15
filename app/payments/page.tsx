import { FileDown, Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { dateOnlyFromStr, dateOnlyStr, localDateStr } from "@/src/lib/tz";
import { listPayments } from "@/src/services/payments";
import { Card, Empty, LinkButton, PageHeader, Stat, Table, TableWrap, Th } from "@/src/components/ui";
import { PaymentFilters } from "./PaymentFilters";
import { PaymentRow } from "./PaymentRow";
import { RowLinks } from "@/src/components/RowLinks";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** First and last day of "YYYY-MM". */
function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: dateOnlyStr(new Date(Date.UTC(y, m, 0))) };
}
function shiftMonth(ym: string, by: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/**
 * Every payment and refund in a date range, one line each. New ones are
 * recorded on their own page; each line opens to edit, and voids or deletes
 * here. Narrowed by student, or by tutor (the families that tutor teaches).
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string; from?: string; to?: string; student?: string; tutor?: string }> }) {
  const q = await searchParams;
  const session = await requireMoney();
  const org = { id: session.organizationId, timezone: session.timezone };
  const today = localDateStr(new Date(), org.timezone);
  const thisMonth = monthBounds(today.slice(0, 7));
  // ?month=YYYY-MM is the old form of the link; a from/to pair wins when both are given.
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? monthBounds(q.month) : null;
  const from = q.from && DATE.test(q.from) ? q.from : month?.from ?? thisMonth.from;
  const to = q.to && DATE.test(q.to) ? q.to : month?.to ?? thisMonth.to;
  const student = q.student ?? "";
  const tutor = q.tutor ?? "";
  const [rows, students, tutors] = await Promise.all([
    listPayments(prisma, org.id, dateOnlyFromStr(from), dateOnlyFromStr(to), { studentId: student || null, tutorId: tutor || null }),
    prisma.student.findMany({ where: { organizationId: org.id, deletedAt: null, OR: [{ archivedAt: null }, { id: student || "" }] }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    prisma.tutor.findMany({ where: { organizationId: org.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const live = rows.filter((r) => !r.voidedAt);
  const received = live.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0);
  const refunded = live.filter((r) => r.amountCents < 0).reduce((s, r) => s - r.amountCents, 0);
  const canWrite = session.role !== "ACCOUNTANT";
  const query = (f: string, t: string) => `/payments?from=${f}&to=${t}${student ? `&student=${student}` : ""}${tutor ? `&tutor=${tutor}` : ""}`;
  const here = encodeURIComponent(query(from, to));
  const ym = from.slice(0, 7);
  const wholeMonth = from === monthBounds(ym).from && to === monthBounds(ym).to;
  const label = wholeMonth
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyFromStr(from))
    : `${from} to ${to}`;
  const prev = monthBounds(shiftMonth(ym, -1));
  const next = monthBounds(shiftMonth(ym, 1));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle={`${label}: ${live.length} ${live.length === 1 ? "entry" : "entries"}, ${formatCents(received - refunded)} net`}
        actions={
          <>
            <LinkButton href={query(prev.from, prev.to)} variant="secondary">Previous</LinkButton>
            <LinkButton href={query(thisMonth.from, thisMonth.to)} variant="secondary">This month</LinkButton>
            <LinkButton href={query(next.from, next.to)} variant="secondary">Next</LinkButton>
            <a href="/api/export?what=payments" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every payment, all time, as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>
            {canWrite && <LinkButton href={`/payments/new?returnTo=${here}`} variant="primary"><Plus aria-hidden />New payment</LinkButton>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Received" value={formatCents(received)} tone="credit" />
        <Stat label="Refunded" value={formatCents(refunded)} tone={refunded > 0 ? "owed" : "muted"} />
        <Stat label="Entries" value={live.length} tone="muted" />
      </div>
      <PaymentFilters from={from} to={to} student={students.some((s) => s.id === student) ? student : ""} tutor={tutors.some((t) => t.id === tutor) ? tutor : ""} students={students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} tutors={tutors} />
      <Card>
        {rows.length === 0 ? <Empty>No payments in this range.</Empty> : (
          <RowLinks>
          <TableWrap>
            <Table data-testid="payments">
              <thead><tr><Th>Date</Th><Th>Account</Th><Th className="hidden sm:table-cell">How</Th><Th className="hidden md:table-cell">Note</Th><Th right>Amount</Th><Th></Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <PaymentRow
                    key={r.id}
                    canWrite={canWrite}
                    here={here}
                    p={{
                      id: r.id, accountId: r.accountId, accountName: r.accountName, paidOn: dateOnlyStr(r.paidOn), paidOnDate: r.paidOn, refund: r.kind === "REFUND", amountCents: r.amountCents,
                      method: r.method, reference: r.reference ?? "", notes: r.notes ?? "", refundReason: r.refundReason ?? "", voided: !!r.voidedAt, voidReason: r.voidReason ?? "", reported: !!r.taxReportedAt,
                    }}
                  />
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
