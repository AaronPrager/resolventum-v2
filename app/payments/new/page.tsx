import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { localDateStr } from "@/src/lib/tz";
import { Card, PageHeader } from "@/src/components/ui";
import { PaymentForm } from "../MoneyForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "New payment" };

/** Record a payment or refund for any family. Reached from the payments list; goes back there when saved. */
export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; account?: string }> }) {
  const q = await searchParams;
  const s = await requireMoney();
  const back = q.returnTo?.startsWith("/") ? q.returnTo : "/payments";
  const accounts = await prisma.account.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="space-y-6">
      <PageHeader title="New payment" back={{ href: back, label: "Back" }} subtitle="Payments go to the family's account, so siblings share one." />
      <Card>
        <PaymentForm today={localDateStr(new Date(), s.timezone)} accounts={accounts} accountId={accounts.some((a) => a.id === q.account) ? q.account : undefined} returnTo={back} />
      </Card>
    </div>
  );
}
