import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { TREATMENT_LABEL, taxSummary } from "@/src/services/expenses";
import { Card, Empty, LinkButton, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { CategoryForm, TaxFiledForm, TaxYearForm } from "./forms";
import { taxFilingStatus } from "@/src/services/taxFiling";
import { incomeByKind } from "@/src/services/reports";

export const dynamic = "force-dynamic";

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const year = q.year && /^\d{4}$/.test(q.year) ? Number(q.year) : new Date().getFullYear();
  const [sum, ty, filing, income] = await Promise.all([taxSummary(prisma, s.organizationId, year), prisma.taxYear.findUnique({ where: { organizationId_year: { organizationId: s.organizationId, year } } }), taxFilingStatus(prisma, s.organizationId, year), incomeByKind(prisma, s.organizationId, year)]);
  return (
    <div className="space-y-6">
      <PageHeader title={`Tax summary ${year}`} back={{ href: "/expenses", label: "Expenses" }}
        subtitle={sum.filedAt ? `Marked as filed on ${formatDate(sum.filedAt)}.` : "Not filed yet."}
        actions={<><LinkButton href={`/expenses/tax?year=${year - 1}`} variant="secondary">{year - 1}</LinkButton><LinkButton href={`/expenses/tax?year=${year + 1}`} variant="secondary">{year + 1}</LinkButton><LinkButton href={`/api/tax-csv?year=${year}`} variant="primary">Download CSV</LinkButton></>} />
      {sum.warnings.map((w) => <p key={w} className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{w}</p>)}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Income received" value={formatCents(income.receivedCents - income.refundsCents)} tone="credit" />
        <Stat label="Spent" value={formatCents(sum.grossCents)} />
        <Stat label="Deductible" value={formatCents(sum.deductibleCents)} tone="credit" data-testid="deductible" />
        <Stat label="Home office share" value={`${(sum.homeOfficeBps / 100).toFixed(2)}%`} tone="muted" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By category (Schedule C)">
          {sum.lines.length === 0 ? <Empty>No expenses in {year}.</Empty> : (
            <TableWrap><Table data-testid="tax-lines">
              <thead><tr><Th>Category</Th><Th className="hidden sm:table-cell">Line</Th><Th right>Spent</Th><Th right>Deductible</Th></tr></thead>
              <tbody>{sum.lines.map((l) => <tr key={l.categoryId}><Td>{l.category} <span className="text-muted">({l.count})</span></Td><Td className="hidden text-muted sm:table-cell">{l.scheduleCLine ?? ""}</Td><Td right num>{formatCents(l.grossCents)}</Td><Td right num>{formatCents(l.deductibleCents)}</Td></tr>)}</tbody>
            </Table></TableWrap>
          )}
        </Card>
        <Card title="By treatment">
          <TableWrap><Table>
            <thead><tr><Th>Treatment</Th><Th right>Spent</Th><Th right>Deductible</Th></tr></thead>
            <tbody>{sum.byTreatment.map((t) => <tr key={t.treatment}><Td>{TREATMENT_LABEL[t.treatment]} <span className="text-muted">({t.count})</span></Td><Td right num>{formatCents(t.grossCents)}</Td><Td right num>{formatCents(t.deductibleCents)}</Td></tr>)}</tbody>
          </Table></TableWrap>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Home office for ${year}`}><TaxYearForm year={year} homeSqft={ty?.homeSqft ?? null} officeSqft={ty?.officeSqft ?? null} percent={ty?.homeOfficeBasisPoints != null ? (ty.homeOfficeBasisPoints / 100).toFixed(2) : ""} filed={!!ty?.filedAt} /></Card>
        <Card title="Tax return"><TaxFiledForm year={year} status={filing} /></Card>
        <Card title="Add a category"><CategoryForm /></Card>
      </div>
    </div>
  );
}
