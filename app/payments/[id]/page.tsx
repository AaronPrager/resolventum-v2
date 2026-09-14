import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents, formatDate, formatWhen } from "@/src/lib/format";
import { Badge, Card, PageHeader } from "@/src/components/ui";
import { PaymentEditForm } from "../MoneyForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment" };

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const s = await requireMoney();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const p = await prisma.payment.findFirst({
    where: { id, organizationId: s.organizationId },
    include: { account: { select: { id: true, name: true } }, allocations: { include: { charge: { select: { description: true, chargedOn: true } } }, orderBy: { charge: { chargedOn: "asc" } } } },
  });
  if (!p) notFound();
  const refund = p.kind === "REFUND";
  const back = returnTo?.startsWith("/") ? returnTo : `/accounts/${p.account.id}`;
  const locked = p.voidedAt ? "This payment is voided, so it cannot be changed." : p.taxReportedAt ? `Marked as reported on a tax return on ${formatWhen(p.taxReportedAt, s.timezone)}. Unmark the year on the tax page to change it.` : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${refund ? "Refund" : "Payment"} of ${formatCents(Math.abs(p.amountCents))}`}
        back={{ href: back, label: returnTo ? "Back" : p.account.name }}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Link href={`/accounts/${p.account.id}`} className="text-brand hover:underline">{p.account.name}</Link><span>{formatDate(p.paidOn)}</span>{p.voidedAt && <Badge tone="owed">voided</Badge>}{p.taxReportedAt && <Badge tone="warn">reported</Badge>}</span>}
      />
      <Card title="Details">
        {locked || s.role === "ACCOUNTANT" ? (
          <p className="text-sm text-muted">{locked ?? "Your role is read-only."}</p>
        ) : (
          <PaymentEditForm
            returnTo={back}
            payment={{ id: p.id, refund, amount: (Math.abs(p.amountCents) / 100).toFixed(2), paidOn: p.paidOn.toISOString().slice(0, 10), method: p.method, reference: p.reference ?? "", notes: p.notes ?? "", refundReason: p.refundReason ?? "" }}
          />
        )}
      </Card>
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
    </div>
  );
}
