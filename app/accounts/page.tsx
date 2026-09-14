import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatTime } from "@/src/lib/format";
import { localDateOnly, localDateStr, zonedToUtc } from "@/src/lib/tz";
import { calendarLessons } from "@/src/services/calendar";
import { accountBalances } from "@/src/services/balances";
import { Balance, Card, Empty, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName };
  const now = new Date();
  const tz = session.timezone;
  const todayStr = localDateStr(now, tz);
  const dayStart = zonedToUtc(todayStr, "00:00", tz);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600 * 1000);
  const [balances, todays] = await Promise.all([
    accountBalances(prisma, org.id, localDateOnly(now, tz)),
    calendarLessons(prisma, org.id, dayStart, dayEnd, tz).then((ls) => ls.filter((l) => l.day === todayStr)),
  ]);
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
      <Card title={`Today, ${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now)}`} actions={<Link href="/calendar" className="text-sm text-brand hover:underline">Calendar</Link>}>
        {todays.length === 0 ? <Empty>No lessons today.</Empty> : (
          <ul className="divide-y divide-line" data-testid="today">
            {todays.map((l) => (
              <li key={l.id} className={`flex items-center gap-3 py-2 text-sm ${l.status === "CANCELLED" ? "text-muted line-through" : ""}`}>
                <span className="w-20 shrink-0 tabular-nums">{formatTime(l.startsAt, tz)}</span>
                <Link href={`/lessons/${l.id}`} className="font-medium text-brand hover:underline">{l.students.map((s) => s.name).join(", ") || "No student"}</Link>
                <span className="truncate text-muted">{l.subject}</span>
                <span className="ml-auto shrink-0 text-muted">{l.durationMin} min{l.locationType === "REMOTE" ? " · remote" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
