import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { localDateStr } from "@/src/lib/tz";
import { accountStatement } from "@/src/services/statement";
import { AdjustmentForm, PaymentForm } from "@/app/payments/MoneyForms";
import { voidEntryAction } from "@/app/payments/actions";
import { Badge, Balance, Button, Card, Empty, Field, Input, LinkButton, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const q = await searchParams;
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  const owned = await prisma.account.findFirst({ where: { id, organizationId: session.organizationId }, select: { id: true } });
  if (!owned) notFound();
  const st = await accountStatement(prisma, id, { from, to });
  if (!st) notFound();
  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    include: { organization: { select: { timezone: true } }, students: { where: { deletedAt: null }, orderBy: { firstName: "asc" } }, guardians: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
  });
  const today = localDateStr(new Date(), account.organization.timezone);
  const voidedCount =
    (await prisma.payment.count({ where: { accountId: id, voidedAt: { not: null } } })) +
    (await prisma.charge.count({ where: { accountId: id, voidedAt: { not: null }, kind: { not: "LESSON" } } }));
  const primary = account.guardians.find((g) => g.isPrimary);

  return (
    <div className="space-y-6">
      <PageHeader
        title={st.accountName}
        back={{ href: "/", label: "All accounts" }}
        subtitle={
          <span>
            {account.students.map((s) => <Link key={s.id} href={`/students/${s.id}`} className="mr-3 text-brand hover:underline">{s.firstName} {s.lastName}</Link>)}
            {primary && <span className="text-muted">{primary.name}{primary.email && ` · ${primary.email}`}{primary.phone && ` · ${primary.phone}`}</span>}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Opening balance" value={<Balance cents={st.openingBalanceCents} />} />
        <Stat label="Charged" value={formatCents(st.chargedCents)} />
        <Stat label="Paid" value={formatCents(st.paidCents)} />
        <Stat label="Closing balance" value={<Balance cents={st.closingBalanceCents} />} data-testid="closing-balance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Record a payment or refund"><PaymentForm accountId={id} today={today} /></Card>
        <Card title="Credit, fee, or tip"><AdjustmentForm accountId={id} today={today} students={account.students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} /></Card>
      </div>

      <Card
        title="Statement"
        actions={
          <form className="flex flex-wrap items-end gap-2" method="get">
            <Field label="From"><Input type="date" name="from" defaultValue={from ? fmtDate(from) : ""} /></Field>
            <Field label="To"><Input type="date" name="to" defaultValue={to ? fmtDate(to) : ""} /></Field>
            <Button type="submit" variant="secondary">Show</Button>
            {(from || to) && <LinkButton href={`/accounts/${id}`} variant="ghost">All time</LinkButton>}
          </form>
        }
      >
        {st.entries.length === 0 ? <Empty>Nothing in this period.</Empty> : (
          <TableWrap>
            <Table data-testid="statement">
              <thead><tr><Th>Date</Th><Th>Description</Th><Th right>Charge</Th><Th right>Payment</Th><Th right>Balance</Th><Th></Th></tr></thead>
              <tbody>
                {st.entries.map((e) => (
                  <tr key={`${e.kind}-${e.id}`} className="hover:bg-surface-2">
                    <Td num>{fmtDate(e.date)}</Td>
                    <Td>
                      <div>{e.description}{e.studentName && st.studentNames.length > 1 && <span className="text-muted"> ({e.studentName})</span>}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge tone={e.kind === "payment" ? "credit" : e.subkind === "LESSON" ? "neutral" : "brand"}>
                          {e.kind === "charge" ? e.subkind.toLowerCase() : e.subkind.toLowerCase().replace("_", " ")}
                        </Badge>
                        {e.appliedPayments.length > 0 && <span>paid by {e.appliedPayments.map((a) => `${formatCents(a.amountCents)} on ${fmtDate(a.paidOn)}`).join(", ")}</span>}
                      </div>
                    </Td>
                    <Td right num>{e.kind === "charge" ? formatCents(e.deltaCents) : ""}</Td>
                    <Td right num>{e.kind === "payment" ? formatCents(-e.deltaCents) : ""}</Td>
                    <Td right num><Balance cents={e.runningBalanceCents} /></Td>
                    <Td right>
                      {(e.kind === "payment" || e.subkind !== "LESSON") && (
                        <form action={voidEntryAction} className="inline">
                          <input type="hidden" name="accountId" value={id} />
                          <input type="hidden" name="kind" value={e.kind} />
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="reason" value="Voided from the statement" />
                          <Button variant="link" className="text-xs text-owed" aria-label={`Void ${e.description}`}>Void</Button>
                        </form>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        {voidedCount > 0 && <p className="mt-3 text-xs text-muted">{voidedCount} voided {voidedCount === 1 ? "entry is" : "entries are"} not shown. Lessons are voided by cancelling them.</p>}
      </Card>
    </div>
  );
}
