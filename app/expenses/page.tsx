import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { formatCents } from "@/src/lib/format";
import { dateOnlyFromStr, localDateStr } from "@/src/lib/tz";
import { listCategories, listExpenses, listVendors, deductibleCents, type TaxTreatment } from "@/src/services/expenses";
import { Badge, Button, Card, Empty, LinkButton, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { discardExpenseDraftAction } from "./actions";
import { ExpenseForm } from "./ExpenseForm";
import { ReceiptBox } from "./ReceiptBox";

export const dynamic = "force-dynamic";

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return { from: dateOnlyFromStr(`${ym}-01`), to: new Date(Date.UTC(y, m, 0)), label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyFromStr(`${ym}-01`)), prev: fmt(new Date(Date.UTC(y, m - 2, 1))), next: fmt(new Date(Date.UTC(y, m, 1))), year: y };
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const today = localDateStr(new Date(), s.timezone);
  const ym = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
  const { from, to, label, prev, next, year } = monthBounds(ym);
  const [rows, categories, vendors, sources, taxYear, draft] = await Promise.all([
    listExpenses(prisma, s.organizationId, from, to),
    listCategories(prisma, s.organizationId),
    listVendors(prisma, s.organizationId),
    prisma.paymentSource.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.taxYear.findUnique({ where: { organizationId_year: { organizationId: s.organizationId, year } } }),
    prisma.draft.findFirst({ where: { organizationId: s.organizationId, kind: "EXPENSE_FROM_RECEIPT", status: "DRAFT" }, orderBy: { createdAt: "desc" } }),
  ]);
  const bps = taxYear?.homeOfficeBasisPoints ?? 0;
  const gross = rows.reduce((a, e) => a + e.amountCents, 0);
  const ded = rows.reduce((a, e) => a + deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, bps), 0);
  const dc = draft?.content as Record<string, unknown> | undefined;
  const initial = dc
    ? { spentOn: String(dc.date ?? today), description: String(dc.description ?? ""), vendor: String(dc.vendor ?? ""), amount: typeof dc.amount === "number" ? dc.amount.toFixed(2) : "", categoryId: String(dc.categoryId ?? ""), taxTreatment: "BUSINESS_DIRECT", businessPercent: "", paymentSourceId: "", notes: String(dc.notes ?? "") }
    : { spentOn: today, description: "", vendor: "", amount: "", categoryId: "", taxTreatment: "BUSINESS_DIRECT", businessPercent: "", paymentSourceId: "", notes: "" };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Expenses, ${label}`}
        actions={<><LinkButton href={`/expenses?month=${prev}`} variant="secondary">Previous</LinkButton><LinkButton href="/expenses" variant="secondary">This month</LinkButton><LinkButton href={`/expenses?month=${next}`} variant="secondary">Next</LinkButton><LinkButton href={`/expenses/tax?year=${year}`} variant="secondary">Tax summary {year}</LinkButton><LinkButton href="/expenses/recurring" variant="secondary">Recurring</LinkButton></>}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Spent" value={formatCents(gross)} />
        <Stat label="Deductible" value={formatCents(ded)} tone="credit" />
        <Stat label="Entries" value={rows.length} tone="muted" />
      </div>
      <Card title="Add an expense" actions={draft && <form action={discardExpenseDraftAction}><input type="hidden" name="draftId" value={draft.id} /><Button variant="link" className="text-xs text-muted">Discard AI draft</Button></form>}>
        <div className="mb-4 rounded-md bg-surface-2 p-3"><ReceiptBox configured={aiConfigured()} /></div>
        {dc && <p className="mb-3 text-sm"><Badge tone="brand">AI read this receipt</Badge> <span className="text-muted">confidence {String(dc.confidence)}{dc.notes ? `. ${String(dc.notes)}` : ""}. Check it, then record.</span></p>}
        <ExpenseForm mode="create" draftId={draft?.id} initial={initial} submitLabel="Record expense"
          categories={categories.map((c) => ({ id: c.id, name: c.name, treatment: c.defaultTaxTreatment }))}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name, categoryId: v.defaultCategoryId, treatment: v.defaultTaxTreatment, percent: v.defaultBusinessPercent }))}
          sources={sources.map((x) => ({ id: x.id, name: x.name }))} />
      </Card>
      <Card>
        {rows.length === 0 ? <Empty>No expenses this month.</Empty> : (
          <TableWrap>
            <Table data-testid="expenses">
              <thead><tr><Th>Date</Th><Th>Vendor</Th><Th>Description</Th><Th className="hidden sm:table-cell">Category</Th><Th right>Amount</Th><Th right className="hidden sm:table-cell">Deductible</Th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2">
                    <Td num>{e.spentOn.toISOString().slice(0, 10)}</Td>
                    <Td>{e.vendor?.name ?? <span className="text-muted">none</span>}</Td>
                    <Td><Link href={`/expenses/${e.id}`} className="font-medium text-brand hover:underline">{e.description}</Link>{e.recurringExpense && <Badge>recurring</Badge>}{e.receipt && <a className="ml-2 text-xs text-brand hover:underline" href={`/api/files/${e.receipt.id}`}>receipt</a>}</Td>
                    <Td className="hidden text-muted sm:table-cell">{e.category.name}</Td>
                    <Td right num>{formatCents(e.amountCents)}</Td>
                    <Td right num className="hidden sm:table-cell">{formatCents(deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, bps))}</Td>
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
