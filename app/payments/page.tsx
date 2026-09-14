import Link from "next/link";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { dateOnlyFromStr, localDateStr } from "@/src/lib/tz";
import { listPayments } from "@/src/services/payments";
import { Badge, Card, Empty, LinkButton, Money, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const from = dateOnlyFromStr(`${ym}-01`);
  const to = new Date(Date.UTC(y, m, 0));
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(from);
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return { from, to, label, prev: fmt(new Date(Date.UTC(y, m - 2, 1))), next: fmt(new Date(Date.UTC(y, m, 1))) };
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const q = await searchParams;
  const session = await requireMoney();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const ym = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : localDateStr(new Date(), org.timezone).slice(0, 7);
  const { from, to, label, prev, next } = monthBounds(ym);
  const rows = await listPayments(prisma, org.id, from, to);
  const live = rows.filter((r) => !r.voidedAt);
  const received = live.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0);
  const refunded = live.filter((r) => r.amountCents < 0).reduce((s, r) => s - r.amountCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payments, ${label}`}
        subtitle="To record a payment, open the account. Payments go to the account, so siblings share one."
        actions={
          <>
            <LinkButton href={`/payments?month=${prev}`} variant="secondary">Previous</LinkButton>
            <LinkButton href="/payments" variant="secondary">This month</LinkButton>
            <LinkButton href={`/payments?month=${next}`} variant="secondary">Next</LinkButton>
            <a href="/api/export?what=payments" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every payment, all time, as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Received" value={formatCents(received)} tone="credit" />
        <Stat label="Refunded" value={formatCents(refunded)} tone={refunded > 0 ? "owed" : "muted"} />
        <Stat label="Entries" value={live.length} tone="muted" />
      </div>
      <Card>
        {rows.length === 0 ? <Empty>No payments this month.</Empty> : (
          <TableWrap>
            <Table data-testid="payments">
              <thead><tr><Th>Date</Th><Th>Account</Th><Th className="hidden sm:table-cell">How</Th><Th className="hidden md:table-cell">Note</Th><Th right>Amount</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`hover:bg-surface-2 ${r.voidedAt ? "text-muted line-through" : ""}`}>
                    <Td num><Link href={`/payments/${r.id}?returnTo=${encodeURIComponent(`/payments?month=${ym}`)}`} className="underline-offset-2 hover:text-brand hover:underline">{formatDate(r.paidOn)}</Link></Td>
                    <Td><Link href={`/accounts/${r.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{r.accountName}</Link></Td>
                    <Td className="hidden sm:table-cell">{r.method.toLowerCase().replace("_", " ")}{r.reference && <span className="text-muted"> · {r.reference}</span>}</Td>
                    <Td className="hidden text-muted md:table-cell">{r.kind === "REFUND" ? `Refund: ${r.refundReason ?? ""}` : r.notes ?? ""}{r.voidedAt && <span className="ml-2 no-underline"><Badge tone="owed">voided</Badge></span>}</Td>
                    <Td right num><Money cents={r.amountCents} signed /></Td>
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
