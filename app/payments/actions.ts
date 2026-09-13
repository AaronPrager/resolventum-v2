"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireSession, requireWriter } from "@/src/auth/current";
import {
  PAYMENT_METHODS, PaymentError, type PaymentMethodInput,
  recordAdjustment, recordPayment, recordRefund, voidCharge, voidPayment,
} from "@/src/services/payments";

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
async function ownedAccount(accountId: string): Promise<string> {
  const session = await requireWriter();
  const a = await prisma.account.findFirst({ where: { id: accountId, organizationId: session.organizationId }, select: { id: true } });
  if (!a) throw new PaymentError("Account not found");
  return a.id;
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
    await ownedAccount(accountId);
    if (isRefund) {
      await recordRefund(prisma, { accountId, amountCents, paidOn: str(fd, "paidOn"), method: method(str(fd, "method")), reason: str(fd, "notes"), reference: str(fd, "reference") });
    } else {
      await recordPayment(prisma, { accountId, amountCents, paidOn: str(fd, "paidOn"), method: method(str(fd, "method")), reference: str(fd, "reference"), notes: str(fd, "notes") });
    }
  } catch (e) {
    if (e instanceof PaymentError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  refresh(accountId);
  return { ok: isRefund ? "Refund recorded" : "Payment recorded" };
}

export async function recordAdjustmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = str(fd, "accountId");
  const amountCents = dollarsToCents(str(fd, "amount"));
  if (Number.isNaN(amountCents)) return { error: "Amount must be a number like 50 or 50.00" };
  const kindRaw = str(fd, "kind");
  const kind = kindRaw === "FEE" || kindRaw === "TIP" ? kindRaw : "CREDIT";
  try {
    await ownedAccount(accountId);
    await recordAdjustment(prisma, { accountId, studentId: str(fd, "studentId") || null, kind, amountCents, chargedOn: str(fd, "chargedOn"), description: str(fd, "description") });
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
  await ownedAccount(accountId);
  if (str(fd, "kind") === "payment") await voidPayment(prisma, str(fd, "id"), reason);
  else await voidCharge(prisma, str(fd, "id"), reason);
  refresh(accountId);
}
