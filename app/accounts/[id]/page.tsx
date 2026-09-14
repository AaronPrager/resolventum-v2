import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { localDateStr } from "@/src/lib/tz";
import { accountStatement } from "@/src/services/statement";
import { AdjustmentForm, PaymentForm } from "@/app/payments/MoneyForms";
import { voidEntryAction } from "@/app/payments/actions";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { emailConfigured } from "@/src/email/send";
import { EmailStatement } from "./EmailStatement";
import { Badge, Balance, Button, Card, Empty, Field, Input, LinkButton, PageHeader, Stat, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { removeGuardianAction } from "../actions";
import { AccountForm, GuardianForm } from "./FamilyForms";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; all?: string }> }) {
  const session = await requireMoney();
  const { id } = await params;
  const q = await searchParams;
  const all = q.all === "1";
  // With no range, show this year with the earlier balance carried in; "All time" lists everything.
  let from = parseDate(q.from) ?? (all || q.to ? null : new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00Z`));
  // The default period ends today: scheduled lessons ahead are on the calendar, not on the bill.
  const to = parseDate(q.to) ?? (all || q.from ? null : new Date(`${localDateStr(new Date(), session.timezone)}T00:00:00Z`));
  const defaulted = !q.from && !q.to && !all;
  const owned = await prisma.account.findFirst({ where: { id, organizationId: session.organizationId }, select: { id: true } });
  if (!owned) notFound();
  let st = await accountStatement(prisma, id, { from, to });
  if (!st) notFound();
  // An account with nothing this year (an old student, say) shows its whole history instead of an empty page.
  let showingAll = all;
  if (defaulted && st.entries.length === 0) {
    st = (await accountStatement(prisma, id, { from: null, to: null })) ?? st;
    showingAll = true;
    from = null;
  }
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
        back={{ href: "/accounts", label: "All accounts" }}
        subtitle={
          <span>
            {account.students.map((s) => <Link key={s.id} href={`/students/${s.id}`} className="mr-3 text-brand hover:underline">{s.firstName} {s.lastName}</Link>)}
            {primary ? <span className="text-muted">{primary.name}{primary.email && ` · ${primary.email}`}{primary.phone && ` · ${primary.phone}`}</span> : <a href="#family" className="text-muted underline-offset-2 hover:underline">Add a contact</a>}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Opening balance" value={<Balance cents={st.openingBalanceCents} />} />
        <Stat label="Charged" value={formatCents(st.chargedCents)} />
        <Stat label="Paid" value={formatCents(st.paidCents)} />
        <Stat label="Closing balance" value={<Balance cents={st.closingBalanceCents} />} data-testid="closing-balance" />
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-2">
        <Card title="Record a payment or refund"><PaymentForm accountId={id} today={today} /></Card>
        <Card title="Credit, fee, or tip"><AdjustmentForm accountId={id} today={today} students={account.students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} /></Card>
      </div>

      <div className="print:hidden"><EmailStatement accountId={id} defaultTo={account.guardians.find((g) => g.isBilling)?.email ?? primary?.email ?? ""} from={from ? fmtDate(from) : ""} to={to ? fmtDate(to) : ""} configured={emailConfigured()} month={today.slice(0, 7)} /></div>

      <Card
        title="Statement"
        actions={
          <form className="flex flex-wrap items-end gap-2" method="get">
            <Field label="From"><Input type="date" name="from" defaultValue={from ? fmtDate(from) : ""} /></Field>
            <Field label="To"><Input type="date" name="to" defaultValue={to ? fmtDate(to) : ""} /></Field>
            <Button type="submit" variant="secondary">Show</Button>
            {(from || to) && <LinkButton href={`/accounts/${id}?all=1`} variant="ghost">All time</LinkButton>}
            {!defaulted && !showingAll && <LinkButton href={`/accounts/${id}`} variant="ghost">This year</LinkButton>}
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
                    <Td num>{formatDate(e.date)}</Td>
                    <Td>
                      <div>{e.description}{e.studentName && st.studentNames.length > 1 && <span className="text-muted"> ({e.studentName})</span>}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge tone={e.kind === "payment" ? "credit" : e.subkind === "LESSON" ? "neutral" : "brand"}>
                          {e.kind === "charge" ? e.subkind.toLowerCase() : e.subkind.toLowerCase().replace("_", " ")}
                        </Badge>
                        {e.appliedPayments.length > 0 && <span>paid by {e.appliedPayments.map((a) => `${formatCents(a.amountCents)} on ${formatDate(a.paidOn)}`).join(", ")}</span>}
                      </div>
                    </Td>
                    <Td right num>{e.kind === "charge" ? formatCents(e.deltaCents) : ""}</Td>
                    <Td right num>{e.kind === "payment" ? formatCents(-e.deltaCents) : ""}</Td>
                    <Td right num><Balance cents={e.runningBalanceCents} /></Td>
                    <Td right>
                      {e.kind === "payment" && <Link href={`/payments/${e.id}`} className="mr-3 text-xs text-brand hover:underline print:hidden">Edit</Link>}
                      {(e.kind === "payment" || e.subkind !== "LESSON") && (
                        <ConfirmForm action={voidEntryAction} className="inline print:hidden" message={`Void "${e.description}"? It leaves the statement and the balance changes. This is recorded, not deleted.`}>
                          <input type="hidden" name="accountId" value={id} />
                          <input type="hidden" name="kind" value={e.kind} />
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="reason" value="Voided from the statement" />
                          <Button variant="link" className="text-xs text-owed" aria-label={`Void ${e.description}`}>Void</Button>
                        </ConfirmForm>
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

      <Card title="Family and contacts" className="print:hidden">
        <div id="family" className="space-y-6">
          <AccountForm accountId={id} name={account.name} notes={account.notes ?? ""} emailReminders={account.emailReminders} emailNotes={account.emailNotes} />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Students</h3>
            <ul className="flex flex-wrap gap-2">
              {account.students.map((s) => (
                <li key={s.id}><Link href={`/students/${s.id}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm hover:border-line-strong">{s.firstName} {s.lastName}</Link></li>
              ))}
              <li><Link href="/students/new" className="inline-flex items-center rounded-full border border-dashed border-line-strong px-3 py-1 text-sm text-muted hover:text-fg">Add a sibling</Link></li>
            </ul>
            <p className="mt-2 text-xs text-muted">To move a student to another family, open the student and choose Edit.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Contacts</h3>
            {account.guardians.length === 0 && <p className="mb-3 text-sm text-muted">No contacts yet. Add a parent so statements have somewhere to go.</p>}
            <ul className="mb-4 divide-y divide-line rounded-xl border border-line" data-testid="guardians">
              {account.guardians.map((g) => (
                <li key={g.id} className="px-4 py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-medium">{g.name}</span>
                      {g.relationship && <span className="text-muted">{g.relationship}</span>}
                      {g.isPrimary && <Badge tone="brand">main</Badge>}
                      {g.isBilling && <Badge>statements</Badge>}
                      {g.isEmergency && <Badge tone="warn">emergency</Badge>}
                      <span className="text-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</span>
                      <span className="ml-auto text-xs text-brand group-open:hidden">Edit</span>
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
                      <GuardianForm accountId={id} guardian={{ id: g.id, name: g.name, email: g.email ?? "", phone: g.phone ?? "", relationship: g.relationship ?? "", address: g.address ?? "", isPrimary: g.isPrimary, isBilling: g.isBilling, isEmergency: g.isEmergency }} />
                      <ConfirmForm action={removeGuardianAction} message={`Remove ${g.name} from this account?`}>
                        <input type="hidden" name="guardianId" value={g.id} /><input type="hidden" name="accountId" value={id} />
                        <Button variant="link" className="text-xs text-owed">Remove contact</Button>
                      </ConfirmForm>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            <details className="rounded-xl border border-dashed border-line-strong px-4 py-3" open={account.guardians.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-brand">Add a contact</summary>
              <div className="mt-3"><GuardianForm accountId={id} /></div>
            </details>
          </div>
        </div>
      </Card>
    </div>
  );
}
