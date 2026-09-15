import { requireMoney } from "@/src/auth/current";
import { Card, PageHeader } from "@/src/components/ui";
import { LeadForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "New lead" };

/** A family who asked about lessons. Goes back to the list when saved. */
export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  await requireMoney();
  const q = await searchParams;
  const back = q.returnTo?.startsWith("/") ? q.returnTo : "/leads";
  return (
    <div className="space-y-6">
      <PageHeader title="New lead" back={{ href: back, label: "Back" }} subtitle="Who asked, what for, and how they found you. The sign-up link under Office adds these on its own." />
      <Card><LeadForm returnTo={back} /></Card>
    </div>
  );
}
