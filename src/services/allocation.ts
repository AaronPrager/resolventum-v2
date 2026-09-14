/**
 * FIFO payment allocation, ported from v1 services/paymentAllocation.js.
 *
 * An Allocation row says "this much of this payment covered this charge". The
 * rows are a record for statements only. The balance never depends on them,
 * and they can be rebuilt from scratch for any account at any time.
 *
 * Rules (same as v1):
 *   - charges are covered oldest first (chargedOn, then id)
 *   - money comes from payments oldest first (paidOn, then id)
 *   - only positive, non-voided charges receive money
 *   - only positive, non-voided payments give money
 *   - a charge never receives more than its amount, a payment never gives more than its amount
 *
 * Negative charges (credits) and refunds are not allocated. They move the
 * balance directly.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export interface ChargeLike {
  id: string;
  amountCents: number;
  chargedOn: Date;
}
export interface PaymentLike {
  id: string;
  amountCents: number;
  paidOn: Date;
}
export interface AllocationRow {
  chargeId: string;
  paymentId: string;
  amountCents: number;
}

function byDateThenId<T extends { id: string }>(dateOf: (t: T) => Date) {
  return (a: T, b: T) => {
    const d = dateOf(a).getTime() - dateOf(b).getTime();
    return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** Pure FIFO. Input order does not matter; output is deterministic. */
export function computeAllocations(charges: ChargeLike[], payments: PaymentLike[]): AllocationRow[] {
  const openCharges = charges
    .filter((c) => c.amountCents > 0)
    .sort(byDateThenId((c) => c.chargedOn))
    .map((c) => ({ id: c.id, remaining: c.amountCents }));
  const openPayments = payments
    .filter((p) => p.amountCents > 0)
    .sort(byDateThenId((p) => p.paidOn))
    .map((p) => ({ id: p.id, remaining: p.amountCents }));

  const out: AllocationRow[] = [];
  let pi = 0;
  for (const charge of openCharges) {
    while (charge.remaining > 0 && pi < openPayments.length) {
      const payment = openPayments[pi];
      if (payment.remaining === 0) {
        pi++;
        continue;
      }
      const amount = Math.min(charge.remaining, payment.remaining);
      out.push({ chargeId: charge.id, paymentId: payment.id, amountCents: amount });
      charge.remaining -= amount;
      payment.remaining -= amount;
    }
    if (pi >= openPayments.length) break;
  }
  return out;
}

export interface RebuildResult {
  accountId: string;
  charges: number;
  payments: number;
  allocations: number;
  allocatedCents: number;
  unallocatedCents: number;
  uncoveredCents: number;
}

/**
 * Drop and rebuild every allocation for one account, in one transaction.
 * Locks nothing beyond the transaction; call it after any change to the
 * account's charges or payments.
 */
export async function rebuildAccountAllocations(prisma: PrismaClient, accountId: string): Promise<RebuildResult> {
  return prisma.$transaction(async (tx) => {
    const charges = await tx.charge.findMany({
      where: { accountId, voidedAt: null },
      select: { id: true, amountCents: true, chargedOn: true },
    });
    const payments = await tx.payment.findMany({
      where: { accountId, voidedAt: null },
      select: { id: true, amountCents: true, paidOn: true },
    });
    const rows = computeAllocations(charges, payments);

    // Both sides, so a charge or payment that just moved to another account leaves no link behind.
    await tx.allocation.deleteMany({ where: { OR: [{ charge: { accountId } }, { payment: { accountId } }] } });
    if (rows.length) await tx.allocation.createMany({ data: rows });

    const allocated = rows.reduce((s, r) => s + r.amountCents, 0);
    const positivePayments = payments.filter((p) => p.amountCents > 0).reduce((s, p) => s + p.amountCents, 0);
    const positiveCharges = charges.filter((c) => c.amountCents > 0).reduce((s, c) => s + c.amountCents, 0);
    return {
      accountId,
      charges: charges.length,
      payments: payments.length,
      allocations: rows.length,
      allocatedCents: allocated,
      unallocatedCents: positivePayments - allocated,
      uncoveredCents: positiveCharges - allocated,
    };
  });
}

/** Rebuild every account in an organization. Returns one result per account. */
export async function rebuildOrganizationAllocations(prisma: PrismaClient, organizationId: string): Promise<RebuildResult[]> {
  const accounts = await prisma.account.findMany({ where: { organizationId }, select: { id: true } });
  const results: RebuildResult[] = [];
  for (const a of accounts) results.push(await rebuildAccountAllocations(prisma, a.id));
  return results;
}
