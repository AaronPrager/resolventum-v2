/**
 * Money in: payments, refunds, and non-lesson charges (credits, fees, tips).
 * Rows are voided with a reason, never deleted. Every change rebuilds the
 * account's FIFO allocations.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr } from "../lib/tz";
import { rebuildAccountAllocations } from "./allocation";

export class PaymentError extends Error {}

export const PAYMENT_METHODS = ["CASH", "CHECK", "CARD", "ZELLE", "VENMO", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function loadAccount(db: PrismaClient, accountId: string) {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true } });
  if (!account) throw new PaymentError("Account not found");
  return account;
}

export interface PaymentInput {
  accountId: string;
  /** Positive, in cents. */
  amountCents: number;
  /** "YYYY-MM-DD" */
  paidOn: string;
  method: PaymentMethodInput;
  reference?: string | null;
  notes?: string | null;
}

export async function recordPayment(db: PrismaClient, input: PaymentInput) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new PaymentError("Amount must be more than zero");
  if (!isDateStr(input.paidOn)) throw new PaymentError("Date is required");
  if (!PAYMENT_METHODS.includes(input.method)) throw new PaymentError("Pick how it was paid");
  const account = await loadAccount(db, input.accountId);
  const payment = await db.payment.create({
    data: {
      organizationId: account.organizationId,
      accountId: account.id,
      kind: "PAYMENT",
      amountCents: input.amountCents,
      paidOn: dateOnlyFromStr(input.paidOn),
      method: input.method,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  await rebuildAccountAllocations(db, account.id);
  return payment;
}

export interface RefundInput {
  accountId: string;
  /** Positive, in cents. Stored negative. */
  amountCents: number;
  paidOn: string;
  method: PaymentMethodInput;
  reason: string;
  reference?: string | null;
}

export async function recordRefund(db: PrismaClient, input: RefundInput) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new PaymentError("Amount must be more than zero");
  if (!isDateStr(input.paidOn)) throw new PaymentError("Date is required");
  if (!PAYMENT_METHODS.includes(input.method)) throw new PaymentError("Pick how it was refunded");
  if (!input.reason.trim()) throw new PaymentError("A reason is required for a refund");
  const account = await loadAccount(db, input.accountId);
  const payment = await db.payment.create({
    data: {
      organizationId: account.organizationId,
      accountId: account.id,
      kind: "REFUND",
      amountCents: -input.amountCents,
      paidOn: dateOnlyFromStr(input.paidOn),
      method: input.method,
      refundReason: input.reason.trim(),
      reference: input.reference?.trim() || null,
    },
  });
  await rebuildAccountAllocations(db, account.id);
  return payment;
}

export interface AdjustmentInput {
  accountId: string;
  studentId?: string | null;
  kind: "CREDIT" | "FEE" | "TIP";
  /** Positive, in cents. A CREDIT is stored as a negative ADJUSTMENT charge. */
  amountCents: number;
  chargedOn: string;
  description: string;
}

/** A credit given to the family, a fee, or a tip they left. */
export async function recordAdjustment(db: PrismaClient, input: AdjustmentInput) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new PaymentError("Amount must be more than zero");
  if (!isDateStr(input.chargedOn)) throw new PaymentError("Date is required");
  if (!input.description.trim()) throw new PaymentError("A description is required");
  const account = await loadAccount(db, input.accountId);
  if (input.studentId) {
    const s = await db.student.findFirst({ where: { id: input.studentId, accountId: account.id } });
    if (!s) throw new PaymentError("Student is not on this account");
  }
  const charge = await db.charge.create({
    data: {
      organizationId: account.organizationId,
      accountId: account.id,
      studentId: input.studentId ?? null,
      kind: input.kind === "CREDIT" ? "ADJUSTMENT" : input.kind,
      amountCents: input.kind === "CREDIT" ? -input.amountCents : input.amountCents,
      chargedOn: dateOnlyFromStr(input.chargedOn),
      description: input.description.trim(),
    },
  });
  await rebuildAccountAllocations(db, account.id);
  return charge;
}

export async function voidPayment(db: PrismaClient, paymentId: string, reason: string) {
  if (!reason.trim()) throw new PaymentError("A reason is required");
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new PaymentError("Payment not found");
  if (p.voidedAt) throw new PaymentError("Already voided");
  await db.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
  await rebuildAccountAllocations(db, p.accountId);
}

/** Void a non-lesson charge. Lesson charges are voided by cancelling the lesson. */
export async function voidCharge(db: PrismaClient, chargeId: string, reason: string) {
  if (!reason.trim()) throw new PaymentError("A reason is required");
  const c = await db.charge.findUnique({ where: { id: chargeId } });
  if (!c) throw new PaymentError("Charge not found");
  if (c.kind === "LESSON") throw new PaymentError("Cancel the lesson instead");
  if (c.voidedAt) throw new PaymentError("Already voided");
  await db.charge.update({ where: { id: chargeId }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
  await rebuildAccountAllocations(db, c.accountId);
}

export interface PaymentListRow {
  id: string;
  paidOn: Date;
  kind: string;
  amountCents: number;
  method: string;
  reference: string | null;
  notes: string | null;
  refundReason: string | null;
  voidedAt: Date | null;
  accountId: string;
  accountName: string;
}

/** Payments in a date range, newest first, voided ones included and flagged. */
export async function listPayments(db: PrismaClient, organizationId: string, from: Date, to: Date): Promise<PaymentListRow[]> {
  const rows = await db.payment.findMany({
    where: { organizationId, paidOn: { gte: from, lte: to } },
    include: { account: { select: { name: true } } },
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((p) => ({
    id: p.id,
    paidOn: p.paidOn,
    kind: p.kind,
    amountCents: p.amountCents,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    refundReason: p.refundReason,
    voidedAt: p.voidedAt,
    accountId: p.accountId,
    accountName: p.account.name,
  }));
}

export interface PaymentEdit {
  /** Positive, in cents. A refund keeps its minus sign. */
  amountCents: number;
  paidOn: string;
  method: PaymentMethodInput;
  reference?: string | null;
  notes?: string | null;
  /** Refunds only, and required for them. */
  refundReason?: string | null;
}

/**
 * Correct a payment or refund in place. Voided rows and rows already marked as
 * reported on a filed tax return cannot be changed.
 */
export async function updatePayment(db: PrismaClient, organizationId: string, paymentId: string, input: PaymentEdit) {
  const p = await db.payment.findFirst({ where: { id: paymentId, organizationId } });
  if (!p) throw new PaymentError("Payment not found");
  if (p.voidedAt) throw new PaymentError("This payment is voided");
  if (p.taxReportedAt) throw new PaymentError("This payment is marked as reported on a tax return. Unmark the year on the tax page first.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new PaymentError("Amount must be more than zero");
  if (!isDateStr(input.paidOn)) throw new PaymentError("Date is required");
  if (!PAYMENT_METHODS.includes(input.method)) throw new PaymentError("Pick how it was paid");
  const refund = p.kind === "REFUND";
  if (refund && !input.refundReason?.trim()) throw new PaymentError("A reason is required for a refund");
  const updated = await db.payment.update({
    where: { id: paymentId },
    data: {
      amountCents: refund ? -input.amountCents : input.amountCents,
      paidOn: dateOnlyFromStr(input.paidOn),
      method: input.method,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(refund ? { refundReason: input.refundReason!.trim() } : {}),
    },
  });
  await rebuildAccountAllocations(db, p.accountId);
  return updated;
}
