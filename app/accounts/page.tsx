import Link from "next/link";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { CircleCheck, FileDown, FolderDown, PiggyBank, TrendingUp } from "lucide-react";
import { formatCents } from "@/src/lib/format";
import { localDateOnly, localDateStr } from "@/src/lib/tz";
import { accountBalances } from "@/src/services/balances";
import { Badge, Balance, Button, Card, Empty, Input, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { RowLinks } from "@/src/components/RowLinks";
import { AccountRowActions } from "./AccountRowActions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accounts" };

/** Every family account. Open balances by default; the tabs show all of them or the archived ones. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const q = await searchParams;
  const session = await requireMoney();
  const org = { id: session.organizationId, name: session.organizationName };
  const balances = await accountBalances(prisma, org.id, localDateOnly(new Date(), session.timezone));
  const current = balances.filter((b) => !b.archived);
  const open = current.filter((b) => b.balanceCents !== 0).sort((a, b) => b.balanceCents - a.balanceCents);
  const owed = open.filter((b) => b.balanceCents > 0).reduce((s, b) => s + b.balanceCents, 0);
  const credit = open.filter((b) => b.balanceCents < 0).reduce((s, b) => s - b.balanceCents, 0);
  const thisMonth = localDateStr(new Date(), session.timezone).slice(0, 7);
  const show = q.show === "all" || q.show === "archived" ? q.show : "open";
  const rows = show === "open" ? open : show === "all" ? current : balances.filter((b) => b.archived);
  const tabs: [string, string][] = [["open", `Open (${open.length})`], ["all", `All (${current.length})`], ["archived", `Archived (${balances.length - current.length})`]];
  const listHref = show === "open" ? "/accounts" : `/accounts?show=${show}`;
  const canWrite = session.role !== "ACCOUNTANT";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        subtitle={<span>{org.name} · {current.length} accounts, {open.length} with an open balance</span>}
        actions={
          <>
            <a href="/api/export?what=accounts" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every account with its balance, as a spreadsheet">
              <FileDown className="size-4" aria-hidden />CSV
            </a>
            <a href="/api/documents?kind=statement" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="One PDF per account with a balance or credit">
              <FolderDown className="size-4" aria-hidden />Statements (ZIP)
            </a>
            <form action="/api/documents" method="get" className="flex items-center gap-2">
              <input type="hidden" name="kind" value="invoice" />
              <Input type="month" name="month" defaultValue={thisMonth} aria-label="Invoice month" className="w-40" required />
              <Button type="submit" variant="secondary" title="One invoice per account with charges that month or a balance owed"><FolderDown aria-hidden />Invoices (ZIP)</Button>
            </form>
          </>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Owed to you" value={formatCents(owed)} tone="owed" icon={<TrendingUp aria-hidden />} />
        <Stat label="Credit held" value={formatCents(credit)} tone="credit" icon={<PiggyBank aria-hidden />} />
        <Stat label="At zero" value={current.length - open.length} tone="muted" icon={<CircleCheck aria-hidden />} />
      </div>
      <nav className="flex flex-wrap gap-1 text-sm" aria-label="Which accounts">
        {tabs.map(([v, label]) => (
          <Link key={v} href={v === "open" ? "/accounts" : `/accounts?show=${v}`} aria-current={show === v ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${show === v ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>{label}</Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? <Empty>{show === "open" ? "Every account is at zero." : show === "archived" ? "Nothing archived." : "No accounts yet."}</Empty> : (
          <RowLinks>
            <TableWrap>
              <Table data-testid="balances">
                <thead><tr><Th>Account</Th><Th className="hidden sm:table-cell">Students</Th><Th right className="hidden sm:table-cell">Charged</Th><Th right className="hidden sm:table-cell">Paid</Th><Th right>Balance</Th><Th></Th></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.accountId} data-href={`/accounts/${b.accountId}`} className="hover:bg-surface-2">
                      <Td><Link href={`/accounts/${b.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{b.name}</Link>{b.archived && <span className="ml-2"><Badge>archived</Badge></span>}</Td>
                      <Td className="hidden text-muted sm:table-cell">{b.studentNames.join(", ")}</Td>
                      <Td right num className="hidden sm:table-cell">{formatCents(b.chargedCents)}</Td>
                      <Td right num className="hidden sm:table-cell">{formatCents(b.paidCents)}</Td>
                      <Td right num><Balance cents={b.balanceCents} /></Td>
                      <Td right className="whitespace-nowrap"><AccountRowActions id={b.accountId} what={b.name} archived={b.archived} canWrite={canWrite} listHref={listHref} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </RowLinks>
        )}
      </Card>
    </div>
  );
}
