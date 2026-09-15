import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { localDateStr } from "@/src/lib/tz";
import { listCategories, listVendors } from "@/src/services/expenses";
import { Badge, Button, Card, PageHeader } from "@/src/components/ui";
import { discardExpenseDraftAction } from "../actions";
import { ExpenseForm } from "../ExpenseForm";
import { ReceiptBox } from "../ReceiptBox";

export const dynamic = "force-dynamic";
export const metadata = { title: "New expense" };

/** Record one expense, by hand or from a photo of the receipt. Goes back to the list when saved. */
export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const s = await requireMoney();
  const q = await searchParams;
  const back = q.returnTo?.startsWith("/") ? q.returnTo : "/expenses";
  const today = localDateStr(new Date(), s.timezone);
  const [categories, vendors, sources, draft] = await Promise.all([
    listCategories(prisma, s.organizationId),
    listVendors(prisma, s.organizationId),
    prisma.paymentSource.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.draft.findFirst({ where: { organizationId: s.organizationId, kind: "EXPENSE_FROM_RECEIPT", status: "DRAFT" }, orderBy: { createdAt: "desc" } }),
  ]);
  const dc = draft?.content as Record<string, unknown> | undefined;
  const initial = dc
    ? { spentOn: String(dc.date ?? today), description: String(dc.description ?? ""), vendor: String(dc.vendor ?? ""), amount: typeof dc.amount === "number" ? dc.amount.toFixed(2) : "", categoryId: String(dc.categoryId ?? ""), taxTreatment: "BUSINESS_DIRECT", businessPercent: "", paymentSourceId: "", notes: String(dc.notes ?? "") }
    : { spentOn: today, description: "", vendor: "", amount: "", categoryId: "", taxTreatment: "BUSINESS_DIRECT", businessPercent: "", paymentSourceId: "", notes: "" };

  return (
    <div className="space-y-6">
      <PageHeader title="New expense" back={{ href: back, label: "Back" }} />
      <Card title="From a receipt" description="Upload a photo or PDF and the form below is filled in for you to check." actions={draft && <form action={discardExpenseDraftAction}><input type="hidden" name="draftId" value={draft.id} /><Button variant="link" className="text-xs text-muted">Discard AI draft</Button></form>}>
        <ReceiptBox configured={aiConfigured()} />
        {dc && <p className="mt-3 text-sm"><Badge tone="brand">AI read this receipt</Badge> <span className="text-muted">confidence {String(dc.confidence)}{dc.notes ? `. ${String(dc.notes)}` : ""}. Check it, then record.</span></p>}
      </Card>
      <Card>
        <ExpenseForm mode="create" draftId={draft?.id} initial={initial} submitLabel="Record expense" returnTo={back}
          categories={categories.map((c) => ({ id: c.id, name: c.name, treatment: c.defaultTaxTreatment }))}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name, categoryId: v.defaultCategoryId, treatment: v.defaultTaxTreatment, percent: v.defaultBusinessPercent }))}
          sources={sources.map((x) => ({ id: x.id, name: x.name }))} />
      </Card>
    </div>
  );
}
