import Link from "next/link";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { dateOnlyFromStr, localDateStr } from "@/src/lib/tz";
import { listExpenses, deductibleCents, type TaxTreatment } from "@/src/services/expenses";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { RowLinks } from "@/src/components/RowLinks";
import { FileDown, Plus } from "lucide-react";
import { ExpenseRowActions } from "./ExpenseRowActions";

export const dynamic = "force-dynamic";

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return { from: dateOnlyFromStr(`${ym}-01`), to: new Date(Date.UTC(y, m, 0)), label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyFromStr(`${ym}-01`)), prev: fmt(new Date(Date.UTC(y, m - 2, 1))), next: fmt(new Date(Date.UTC(y, m, 1))), year: y };
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await requireMoney();
  const q = await searchParams;
  const today = localDateStr(new Date(), s.timezone);
  const ym = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
  const { from, to, label, prev, next, year } = monthBounds(ym);
  const [rows, taxYear] = await Promise.all([
    listExpenses(prisma, s.organizationId, from, to, { includeVoided: true }),
    prisma.taxYear.findUnique({ where: { organizationId_year: { organizationId: s.organizationId, year } } }),
  ]);
  const live = rows.filter((e) => !e.voidedAt);
  const bps = taxYear?.homeOfficeBasisPoints ?? 0;
  const gross = live.reduce((a, e) => a + e.amountCents, 0);
  const ded = live.reduce((a, e) => a + deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, bps), 0);
  const canWrite = s.role !== "ACCOUNTANT";
  const here = encodeURIComponent(`/expenses?month=${ym}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle={`${label}: ${live.length} ${live.length === 1 ? "entry" : "entries"}, ${formatCents(gross)}`}
        actions={<><LinkButton href={`/expenses?month=${prev}`} variant="secondary">Previous</LinkButton><LinkButton href="/expenses" variant="secondary">This month</LinkButton><LinkButton href={`/expenses?month=${next}`} variant="secondary">Next</LinkButton><LinkButton href={`/expenses/tax?year=${year}`} variant="secondary">Tax summary {year}</LinkButton><LinkButton href="/expenses/recurring" variant="secondary">Recurring</LinkButton><a href="/api/export?what=expenses" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every expense, all time, as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>{canWrite && <LinkButton href={`/expenses/new?returnTo=${here}`} variant="primary"><Plus aria-hidden />New expense</LinkButton>}</>}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Spent" value={formatCents(gross)} />
        <Stat label="Deductible" value={formatCents(ded)} tone="credit" />
        <Stat label="Entries" value={live.length} tone="muted" />
      </div>
      <Card>
        {rows.length === 0 ? <Empty action={canWrite && <LinkButton href={`/expenses/new?returnTo=${here}`} variant="primary"><Plus aria-hidden />New expense</LinkButton>}>No expenses this month.</Empty> : (
          <RowLinks>
            <TableWrap>
              <Table data-testid="expenses">
                <thead><tr><Th>Date</Th><Th>Vendor</Th><Th>Description</Th><Th className="hidden sm:table-cell">Category</Th><Th right>Amount</Th><Th right className="hidden sm:table-cell">Deductible</Th><Th></Th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} data-href={`/expenses/${e.id}?returnTo=${here}`} className={`hover:bg-surface-2 ${e.voidedAt ? "text-muted line-through" : ""}`}>
                      <Td num>{formatDate(e.spentOn)}</Td>
                      <Td>{e.vendor?.name ?? <span className="text-muted">none</span>}</Td>
                      <Td>
                        <Link href={`/expenses/${e.id}?returnTo=${here}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{e.description}</Link>
                        {e.recurringExpense && <span className="ml-2 no-underline"><Badge>recurring</Badge></span>}
                        {e.receipt && <a className="ml-2 text-xs text-brand hover:underline" href={`/api/files/${e.receipt.id}`}>receipt</a>}
                        {e.voidedAt && <span className="ml-2 inline-flex items-center gap-1 no-underline"><Badge tone="owed">voided</Badge>{e.voidReason && e.voidReason !== "Voided" && <span className="text-xs">{e.voidReason}</span>}</span>}
                      </Td>
                      <Td className="hidden text-muted sm:table-cell">{e.category.name}</Td>
                      <Td right num>{formatCents(e.amountCents)}</Td>
                      <Td right num className="hidden sm:table-cell">{e.voidedAt ? "" : formatCents(deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, bps))}</Td>
                      <Td right className="whitespace-nowrap"><ExpenseRowActions id={e.id} what={e.description} voided={!!e.voidedAt} canWrite={canWrite} here={here} /></Td>
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
