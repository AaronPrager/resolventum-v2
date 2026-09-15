"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireSession, requireWriter } from "@/src/auth/current";
import {
  PAYMENT_METHODS, PaymentError, type PaymentMethodInput,
  deletePayment, recordAdjustment, recordPayment, recordRefund, updatePayment, voidCharge, voidPayment,
} from "@/src/services/payments";
import { redirect } from "next/navigation";
import { auditAs } from "@/src/services/audit";
import { formatCents } from "@/src/lib/format";

export interface ActionState {
  error?: string;
  ok?: string;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function dollarsToCents(s: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
function method(s: string): PaymentMethodInput {
  return (PAYMENT_METHODS as readonly string[]).includes(s) ? (s as PaymentMethodInput) : "OTHER";
}
async function ownedAccount(accountId: string) {
  const session = await requireWriter();
  const a = await prisma.account.findFirst({ where: { id: accountId, organizationId: session.organizationId }, select: { id: true, name: true } });
  if (!a) throw new PaymentError("Account not found");
  return { session, account: a };
}
function refresh(accountId: string) {
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/payments");
  revalidatePath("/");
  revalidatePath("/students");
}

export async function recordPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = str(fd, "accountId");
  const amountCents = dollarsToCents(str(fd, "amount"));
  if (Number.isNaN(amountCents)) return { error: "Amount must be a number like 130 or 130.00" };
  const isRefund = str(fd, "kind") === "REFUND";
  try {
    const { session, account } = await ownedAccount(accountId);
    const p = isRefund
      ? await recordRefund(prisma, { accountId, amountCents, paidOn: str(fd, "paidOn"), method: method(str(fd, "method")), reason: str(fd, "notes"), reference: str(fd, "reference") })
      : await recordPayment(prisma, { accountId, amountCents, paidOn: str(fd, "paidOn"), method: method(str(fd, "method")), reference: str(fd, "reference"), notes: str(fd, "notes") });
    await auditAs(prisma, session, { action: isRefund ? "refund.record" : "payment.record", subjectType: "payment", subjectId: p.id, summary: `${account.name}: ${formatCents(amountCents)} by ${method(str(fd, "method")).toLowerCase()}${isRefund ? `, ${str(fd, "notes")}` : ""}` });
  } catch (e) {
    if (e instanceof PaymentError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  refresh(accountId);
  const returnTo = str(fd, "returnTo");
  if (returnTo.startsWith("/")) redirect(returnTo);
  return { ok: isRefund ? "Refund recorded" : "Payment recorded" };
}

export async function recordAdjustmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = str(fd, "accountId");
  const amountCents = dollarsToCents(str(fd, "amount"));
  if (Number.isNaN(amountCents)) return { error: "Amount must be a number like 50 or 50.00" };
  const kindRaw = str(fd, "kind");
  const kind = kindRaw === "FEE" || kindRaw === "TIP" ? kindRaw : "CREDIT";
  try {
    const { session, account } = await ownedAccount(accountId);
    const c = await recordAdjustment(prisma, { accountId, studentId: str(fd, "studentId") || null, kind, amountCents, chargedOn: str(fd, "chargedOn"), description: str(fd, "description") });
    await auditAs(prisma, session, { action: kind === "CREDIT" ? "credit.record" : kind === "FEE" ? "fee.record" : "tip.record", subjectType: "charge", subjectId: c.id, summary: `${account.name}: ${formatCents(amountCents)}, ${str(fd, "description")}` });
  } catch (e) {
    if (e instanceof PaymentError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  refresh(accountId);
  return { ok: `${kind === "CREDIT" ? "Credit" : kind === "FEE" ? "Fee" : "Tip"} recorded` };
}

export async function voidEntryAction(fd: FormData): Promise<void> {
  const accountId = str(fd, "accountId");
  const reason = str(fd, "reason") || "Voided";
  const { session, account } = await ownedAccount(accountId);
  const kind = str(fd, "kind") === "payment" ? "payment" : "charge";
  if (kind === "payment") await voidPayment(prisma, str(fd, "id"), reason);
  else await voidCharge(prisma, str(fd, "id"), reason);
  await auditAs(prisma, session, { action: `${kind}.void`, subjectType: kind, subjectId: str(fd, "id"), summary: `${account.name}: ${reason}` });
  refresh(accountId);
}

export async function updatePaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "paymentId");
  const back = str(fd, "returnTo");
  try {
    const session = await requireWriter();
    const amountCents = dollarsToCents(str(fd, "amount"));
    if (Number.isNaN(amountCents)) return { error: "Amount must be a number like 130 or 130.00" };
    await updatePayment(prisma, session.organizationId, id, {
      amountCents, paidOn: str(fd, "paidOn"), method: method(str(fd, "method")), reference: str(fd, "reference"), notes: str(fd, "notes"), refundReason: str(fd, "refundReason"),
    });
    await auditAs(prisma, session, { action: "payment.update", subjectType: "payment", subjectId: id, summary: `${formatCents(amountCents)} on ${str(fd, "paidOn")} by ${method(str(fd, "method")).toLowerCase()}` });
  } catch (e) {
    if (e instanceof PaymentError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  revalidatePath("/payments");
  revalidatePath("/accounts", "layout");
  redirect(back.startsWith("/") ? back : "/payments");
}

/** Void a row on the payments list. Nothing is deleted; the row stays, struck through, with the reason. */
export async function voidPaymentRowAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "paymentId");
  const reason = str(fd, "reason") || "Voided";
  try {
    const session = await requireWriter();
    const p = await prisma.payment.findFirst({ where: { id, organizationId: session.organizationId }, select: { accountId: true, account: { select: { name: true } } } });
    if (!p) return { error: "Payment not found" };
    await voidPayment(prisma, id, reason);
    await auditAs(prisma, session, { action: "payment.void", subjectType: "payment", subjectId: id, summary: `${p.account.name}: ${reason}` });
    refresh(p.accountId);
    revalidatePath("/accounts", "layout");
  } catch (e) {
    if (e instanceof PaymentError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  return { ok: "Voided" };
}

/** Delete a mistaken entry from the payments list. The audit log keeps what it was. */
export async function deletePaymentRowAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "paymentId");
  try {
    const session = await requireWriter();
    const before = await prisma.payment.findFirst({ where: { id, organizationId: session.organizationId }, select: { accountId: true, amountCents: true, paidOn: true, method: true, account: { select: { name: true } } } });
    if (!before) return { error: "Payment not found" };
    await deletePayment(prisma, session.organizationId, id);
    await auditAs(prisma, session, { action: "payment.delete", subjectType: "payment", subjectId: id, summary: `${before.account.name}: ${formatCents(before.amountCents)} by ${before.method.toLowerCase()} on ${before.paidOn.toISOString().slice(0, 10)}` });
    refresh(before.accountId);
    revalidatePath("/accounts", "layout");
  } catch (e) {
    if (e instanceof PaymentError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  return { ok: "Deleted" };
}
