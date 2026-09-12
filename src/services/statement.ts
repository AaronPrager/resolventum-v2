/**
 * Account statement: every charge and payment in date order with a running
 * balance. Positive balance = the family owes money.
 *
 * Ported from v1 services/ledgerStatement.js, with two differences: the
 * account (not the student) is the unit, and the opening balance comes from
 * charges and payments before the period, never from stored paid amounts.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export interface AppliedPayment {
  paymentId: string;
  paidOn: Date;
  amountCents: number;
}

export interface StatementEntry {
  id: string;
  kind: "charge" | "payment";
  date: Date;
  createdAt: Date;
  description: string;
  /// Charge kind (LESSON, FEE, TIP, ADJUSTMENT) or payment method (VENMO, ZELLE, ...).
  subkind: string;
  studentName: string | null;
  /// Signed effect on the balance: charges add, payments subtract.
  deltaCents: number;
  runningBalanceCents: number;
  appliedPayments: AppliedPayment[];
}

export interface Statement {
  accountId: string;
  accountName: string;
  studentNames: string[];
  from: Date | null;
  to: Date | null;
  openingBalanceCents: number;
  closingBalanceCents: number;
  chargedCents: number;
  paidCents: number;
  entries: StatementEntry[];
}

function sortEntries(a: StatementEntry, b: StatementEntry): number {
  const d = a.date.getTime() - b.date.getTime();
  if (d !== 0) return d;
  const c = a.createdAt.getTime() - b.createdAt.getTime();
  if (c !== 0) return c;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function accountStatement(
  prisma: PrismaClient,
  accountId: string,
  range: { from?: Date | null; to?: Date | null } = {},
): Promise<Statement | null> {
  const from = range.from ?? null;
  const to = range.to ?? null;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { students: { where: { deletedAt: null }, orderBy: { firstName: "asc" } } },
  });
  if (!account) return null;
  const studentName = new Map(account.students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

  const [charges, payments] = await Promise.all([
    prisma.charge.findMany({
      where: { accountId, voidedAt: null },
      include: { allocations: { include: { payment: { select: { id: true, paidOn: true } } } } },
    }),
    prisma.payment.findMany({ where: { accountId, voidedAt: null } }),
  ]);

  let opening = 0;
  const entries: StatementEntry[] = [];
  for (const c of charges) {
    if (from && c.chargedOn < from) { opening += c.amountCents; continue; }
    if (to && c.chargedOn > to) continue;
    entries.push({
      id: c.id,
      kind: "charge",
      date: c.chargedOn,
      createdAt: c.createdAt,
      description: c.description,
      subkind: c.kind,
      studentName: c.studentId ? studentName.get(c.studentId) ?? null : null,
      deltaCents: c.amountCents,
      runningBalanceCents: 0,
      appliedPayments: c.allocations
        .map((a) => ({ paymentId: a.payment.id, paidOn: a.payment.paidOn, amountCents: a.amountCents }))
        .sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime()),
    });
  }
  for (const p of payments) {
    if (from && p.paidOn < from) { opening -= p.amountCents; continue; }
    if (to && p.paidOn > to) continue;
    entries.push({
      id: p.id,
      kind: "payment",
      date: p.paidOn,
      createdAt: p.createdAt,
      description: p.kind === "REFUND" ? `Refund${p.refundReason ? `: ${p.refundReason}` : ""}` : p.notes || "Payment",
      subkind: p.method,
      studentName: null,
      deltaCents: -p.amountCents,
      runningBalanceCents: 0,
      appliedPayments: [],
    });
  }
  entries.sort(sortEntries);

  let running = opening;
  let charged = 0;
  let paid = 0;
  for (const e of entries) {
    running += e.deltaCents;
    e.runningBalanceCents = running;
    if (e.kind === "charge") charged += e.deltaCents;
    else paid -= e.deltaCents;
  }

  return {
    accountId: account.id,
    accountName: account.name,
    studentNames: [...studentName.values()],
    from,
    to,
    openingBalanceCents: opening,
    closingBalanceCents: running,
    chargedCents: charged,
    paidCents: paid,
    entries,
  };
}
