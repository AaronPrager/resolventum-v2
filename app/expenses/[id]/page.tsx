import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { listCategories, listVendors } from "@/src/services/expenses";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/src/components/ui";
import { voidExpenseAction } from "../actions";
import { ExpenseForm } from "../ExpenseForm";

export const dynamic = "force-dynamic";

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const e = await prisma.expense.findFirst({ where: { id, organizationId: s.organizationId }, include: { vendor: true, receipt: { select: { id: true, name: true } } } });
  if (!e) notFound();
  const [categories, vendors, sources] = await Promise.all([
    listCategories(prisma, s.organizationId), listVendors(prisma, s.organizationId),
    prisma.paymentSource.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={e.description} back={{ href: `/expenses?month=${e.spentOn.toISOString().slice(0, 7)}`, label: "Expenses" }}
        subtitle={<span className="inline-flex items-center gap-2">{e.voidedAt && <Badge tone="owed">voided: {e.voidReason}</Badge>}{e.receipt && <a className="text-brand hover:underline" href={`/api/files/${e.receipt.id}`}>receipt: {e.receipt.name}</a>}</span>} />
      {!e.voidedAt && (
        <>
          <Card>
            <ExpenseForm mode="update" expenseId={e.id} submitLabel="Save"
              initial={{ spentOn: e.spentOn.toISOString().slice(0, 10), description: e.description, vendor: e.vendor?.name ?? "", amount: (e.amountCents / 100).toFixed(2), categoryId: e.categoryId, taxTreatment: e.taxTreatment, businessPercent: e.businessPercent != null ? String(e.businessPercent) : "", paymentSourceId: e.paymentSourceId ?? "", notes: e.notes ?? "" }}
              categories={categories.map((c) => ({ id: c.id, name: c.name, treatment: c.defaultTaxTreatment }))}
              vendors={vendors.map((v) => ({ id: v.id, name: v.name, categoryId: v.defaultCategoryId, treatment: v.defaultTaxTreatment, percent: v.defaultBusinessPercent }))}
              sources={sources.map((x) => ({ id: x.id, name: x.name }))} />
          </Card>
          <Card title="Void this expense">
            <form action={voidExpenseAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="expenseId" value={e.id} />
              <Field label="Reason"><Input name="reason" required /></Field>
              <Button variant="danger">Void</Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
