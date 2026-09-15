import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents, formatDate, formatWhen } from "@/src/lib/format";
import { Badge, Card } from "@/src/components/ui";
import { Fact, RecordScreen } from "@/src/components/RecordScreen";
import { PaymentEditForm } from "../MoneyForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment" };

const METHOD: Record<string, string> = { ZELLE: "Zelle", VENMO: "Venmo", CASH: "Cash", CHECK: "Check", CARD: "Card", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

/** One payment or refund. Opens read-only; Edit shows the form. */
export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string; edit?: string }> }) {
  const s = await requireMoney();
  const { id } = await params;
  const { returnTo, edit } = await searchParams;
  const p = await prisma.payment.findFirst({
    where: { id, organizationId: s.organizationId },
    include: { account: { select: { id: true, name: true } }, allocations: { include: { charge: { select: { description: true, chargedOn: true } } }, orderBy: { charge: { chargedOn: "asc" } } } },
  });
  if (!p) notFound();
  const refund = p.kind === "REFUND";
  const back = returnTo?.startsWith("/") ? returnTo : `/accounts/${p.account.id}`;
  const locked = p.voidedAt ? "This payment is voided, so it cannot be changed." : p.taxReportedAt ? `Marked as reported on a tax return on ${formatWhen(p.taxReportedAt, s.timezone)}. Unmark the year on the tax page to change it.` : null;
  const canEdit = !locked && s.role !== "ACCOUNTANT";

  const overview = (
    <Card>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={refund ? "Refund amount" : "Amount"}><span className="text-lg font-semibold tabular-nums">{formatCents(Math.abs(p.amountCents))}</span></Fact>
        <Fact label="Date">{formatDate(p.paidOn)}</Fact>
        <Fact label="How">{METHOD[p.method] ?? p.method}{p.reference && <span className="text-muted"> · {p.reference}</span>}</Fact>
        <Fact label="Account"><Link href={`/accounts/${p.account.id}`} className="text-brand hover:underline">{p.account.name}</Link></Fact>
        {refund && <Fact label="Reason for the refund" className="sm:col-span-2">{p.refundReason || <span className="text-muted">None given</span>}</Fact>}
        <Fact label="Notes" className="sm:col-span-2">{p.notes || <span className="text-muted">None</span>}</Fact>
        {p.provider && <Fact label="Collected by">{p.provider}{p.providerRef && <span className="text-muted"> · {p.providerRef}</span>}</Fact>}
        {p.voidedAt && <Fact label="Voided" className="sm:col-span-2">{formatWhen(p.voidedAt, s.timezone)}{p.voidReason && p.voidReason !== "Voided" && <span className="text-muted"> · {p.voidReason}</span>}</Fact>}
      </div>
      {locked && <p className="mt-4 text-xs text-muted">{locked}</p>}
    </Card>
  );

  return (
    <RecordScreen
      title={`${refund ? "Refund" : "Payment"} of ${formatCents(Math.abs(p.amountCents))}`}
      editTitle={`Edit ${refund ? "refund" : "payment"}`}
      back={{ href: back, label: returnTo ? "Back" : p.account.name }}
      subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Link href={`/accounts/${p.account.id}`} className="text-brand hover:underline">{p.account.name}</Link><span>{formatDate(p.paidOn)}</span>{p.voidedAt && <Badge tone="owed">voided</Badge>}{p.taxReportedAt && <Badge tone="warn">reported</Badge>}</span>}
      canEdit={canEdit}
      defaultEditing={edit === "1"}
      overview={overview}
      form={
        <Card title="Details">
          <PaymentEditForm
            returnTo={back}
            payment={{ id: p.id, refund, amount: (Math.abs(p.amountCents) / 100).toFixed(2), paidOn: p.paidOn.toISOString().slice(0, 10), method: p.method, reference: p.reference ?? "", notes: p.notes ?? "", refundReason: p.refundReason ?? "" }}
          />
        </Card>
      }
    >
      {!refund && (
        <Card title="What it paid for">
          {p.allocations.length === 0 ? <p className="text-sm text-muted">Not applied to any charge yet; it sits as credit on the account.</p> : (
            <ul className="divide-y divide-line text-sm">
              {p.allocations.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2"><span><span className="mr-3 tabular-nums text-muted">{formatDate(a.charge.chargedOn)}</span>{a.charge.description}</span><span className="tabular-nums">{formatCents(a.amountCents)}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Payments cover the oldest unpaid charges first. Editing the amount or date redoes this.</p>
        </Card>
      )}
    </RecordScreen>
  );
}
