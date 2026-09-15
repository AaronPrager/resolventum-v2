import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents, formatDate, formatWhen } from "@/src/lib/format";
import { TREATMENT_LABEL, deductibleCents, listCategories, listVendors, type TaxTreatment } from "@/src/services/expenses";
import { Badge, Button, Card, Field, Input } from "@/src/components/ui";
import { Fact, RecordScreen } from "@/src/components/RecordScreen";
import { voidExpenseAction } from "../actions";
import { ExpenseForm } from "../ExpenseForm";

export const dynamic = "force-dynamic";

/** One expense. Opens read-only; Edit shows the form. */
export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string; edit?: string }> }) {
  const s = await requireMoney();
  const { id } = await params;
  const { returnTo, edit } = await searchParams;
  const e = await prisma.expense.findFirst({
    where: { id, organizationId: s.organizationId },
    include: { vendor: true, category: { select: { name: true } }, paymentSource: { select: { name: true } }, receipt: { select: { id: true, name: true } }, recurringExpense: { select: { id: true } }, tutor: { select: { name: true } } },
  });
  if (!e) notFound();
  const year = e.spentOn.getUTCFullYear();
  const [categories, vendors, sources, taxYear] = await Promise.all([
    listCategories(prisma, s.organizationId), listVendors(prisma, s.organizationId),
    prisma.paymentSource.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.taxYear.findUnique({ where: { organizationId_year: { organizationId: s.organizationId, year } } }),
  ]);
  const back = returnTo?.startsWith("/") ? returnTo : `/expenses?month=${e.spentOn.toISOString().slice(0, 7)}`;
  const canEdit = !e.voidedAt && s.role !== "ACCOUNTANT";
  const treatment = e.taxTreatment as TaxTreatment;
  const deductible = deductibleCents({ amountCents: e.amountCents, taxTreatment: treatment, businessPercent: e.businessPercent }, taxYear?.homeOfficeBasisPoints ?? 0);

  const overview = (
    <Card>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Amount"><span className="text-lg font-semibold tabular-nums">{formatCents(e.amountCents)}</span></Fact>
        <Fact label="Date">{formatDate(e.spentOn)}</Fact>
        <Fact label="Vendor">{e.vendor?.name ?? <span className="text-muted">None</span>}</Fact>
        <Fact label="Category">{e.category.name}</Fact>
        <Fact label="Tax treatment">{TREATMENT_LABEL[treatment]}{treatment === "PARTIAL_USE" && e.businessPercent != null && <span className="text-muted">, {e.businessPercent}% business</span>}</Fact>
        <Fact label="Deductible"><span className="tabular-nums">{formatCents(deductible)}</span></Fact>
        <Fact label="Paid from">{e.paymentSource?.name ?? <span className="text-muted">Not set</span>}</Fact>
        <Fact label="Receipt">{e.receipt ? <a className="text-brand hover:underline" href={`/api/files/${e.receipt.id}`}>{e.receipt.name}</a> : <span className="text-muted">None</span>}</Fact>
        {e.tutor && <Fact label="Tutor payout">{e.tutor.name}</Fact>}
        {e.recurringExpense && <Fact label="Recurring"><Link href="/expenses/recurring" className="text-brand hover:underline">Part of a recurring expense</Link></Fact>}
        <Fact label="Notes" className="sm:col-span-2">{e.notes || <span className="text-muted">None</span>}</Fact>
        {e.voidedAt && <Fact label="Voided" className="sm:col-span-2">{formatWhen(e.voidedAt, s.timezone)}{e.voidReason && e.voidReason !== "Voided" && <span className="text-muted"> · {e.voidReason}</span>}</Fact>}
      </div>
    </Card>
  );

  return (
    <RecordScreen
      title={e.description}
      editTitle="Edit expense"
      back={{ href: back, label: returnTo ? "Back" : "Expenses" }}
      subtitle={<span className="inline-flex flex-wrap items-center gap-2"><span>{formatDate(e.spentOn)}</span><span>{formatCents(e.amountCents)}</span>{e.voidedAt && <Badge tone="owed">voided</Badge>}{e.taxReportedAt && <Badge tone="warn">reported</Badge>}</span>}
      canEdit={canEdit}
      defaultEditing={edit === "1"}
      overview={overview}
      form={
        <Card title="Details">
          <ExpenseForm mode="update" expenseId={e.id} submitLabel="Save"
            initial={{ spentOn: e.spentOn.toISOString().slice(0, 10), description: e.description, vendor: e.vendor?.name ?? "", amount: (e.amountCents / 100).toFixed(2), categoryId: e.categoryId, taxTreatment: e.taxTreatment, businessPercent: e.businessPercent != null ? String(e.businessPercent) : "", paymentSourceId: e.paymentSourceId ?? "", notes: e.notes ?? "" }}
            categories={categories.map((c) => ({ id: c.id, name: c.name, treatment: c.defaultTaxTreatment }))}
            vendors={vendors.map((v) => ({ id: v.id, name: v.name, categoryId: v.defaultCategoryId, treatment: v.defaultTaxTreatment, percent: v.defaultBusinessPercent }))}
            sources={sources.map((x) => ({ id: x.id, name: x.name }))} />
        </Card>
      }
    >
      {canEdit && (
        <Card title="Void this expense" description="Keeps the line, struck through, and takes it out of the totals.">
          <form action={voidExpenseAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="expenseId" value={e.id} />
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            <Field label="Reason (optional)"><Input name="reason" /></Field>
            <Button variant="danger">Void</Button>
          </form>
        </Card>
      )}
    </RecordScreen>
  );
}
