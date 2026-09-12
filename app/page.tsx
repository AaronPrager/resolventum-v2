import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { accountBalances } from "@/src/services/balances";
import { Balance, Card, Empty, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName };
  const balances = await accountBalances(prisma, org.id, new Date());
  const open = balances.filter((b) => b.balanceCents !== 0).sort((a, b) => b.balanceCents - a.balanceCents);
  const owed = open.filter((b) => b.balanceCents > 0).reduce((s, b) => s + b.balanceCents, 0);
  const credit = open.filter((b) => b.balanceCents < 0).reduce((s, b) => s - b.balanceCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={org.name} subtitle={<span>{balances.length} accounts. {open.length} with an open balance.</span>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Owed to you" value={formatCents(owed)} tone="owed" />
        <Stat label="Credit held" value={formatCents(credit)} tone="credit" />
        <Stat label="Accounts at zero" value={balances.length - open.length} tone="muted" />
      </div>
      <Card title="Open balances">
        {open.length === 0 ? <Empty>Every account is at zero.</Empty> : (
          <TableWrap>
            <Table data-testid="balances">
              <thead><tr><Th>Account</Th><Th className="hidden sm:table-cell">Students</Th><Th right className="hidden sm:table-cell">Charged</Th><Th right className="hidden sm:table-cell">Paid</Th><Th right>Balance</Th></tr></thead>
              <tbody>
                {open.map((b) => (
                  <tr key={b.accountId} className="hover:bg-surface-2">
                    <Td><Link href={`/accounts/${b.accountId}`} className="font-medium text-brand hover:underline">{b.name}</Link></Td>
                    <Td className="hidden text-muted sm:table-cell">{b.studentNames.join(", ")}</Td>
                    <Td right num className="hidden sm:table-cell">{formatCents(b.chargedCents)}</Td>
                    <Td right num className="hidden sm:table-cell">{formatCents(b.paidCents)}</Td>
                    <Td right num><Balance cents={b.balanceCents} /></Td>
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
