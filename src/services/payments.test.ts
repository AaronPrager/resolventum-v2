/**
 * Runs against the local resolventum_v2 database after `npm run import`.
 * Creates rows for one account and removes them afterwards.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { rebuildAccountAllocations } from "./allocation";
import { accountBalances } from "./balances";
import { accountStatement } from "./statement";
import { PaymentError, listPayments, recordAdjustment, recordPayment, recordRefund, voidCharge, voidPayment } from "./payments";

let accountId: string;
let orgId: string;
const payments: string[] = [];
const charges: string[] = [];

async function balance() {
  const rows = await accountBalances(prisma, orgId, new Date("2030-01-01T00:00:00Z"));
  return rows.find((r) => r.accountId === accountId)!.balanceCents;
}

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  accountId = s.accountId;
  orgId = s.organizationId;
});

afterEach(async () => {
  await prisma.payment.deleteMany({ where: { id: { in: payments.splice(0) } } });
  await prisma.charge.deleteMany({ where: { id: { in: charges.splice(0) } } });
  await rebuildAccountAllocations(prisma, accountId);
});

describe("payments", () => {
  it("records a payment and the balance drops", async () => {
    const before = await balance();
    const p = await recordPayment(prisma, { accountId, amountCents: 20000, paidOn: "2026-09-12", method: "ZELLE", reference: "memo 1" });
    payments.push(p.id);
    expect(p.kind).toBe("PAYMENT");
    expect(p.paidOn.toISOString().slice(0, 10)).toBe("2026-09-12");
    expect(await balance()).toBe(before - 20000);
    const st = (await accountStatement(prisma, accountId))!;
    const entry = st.entries.find((e) => e.id === p.id)!;
    expect(entry.kind).toBe("payment");
    expect(entry.subkind).toBe("ZELLE");
  });

  it("records a refund as a negative payment with a reason", async () => {
    const before = await balance();
    const r = await recordRefund(prisma, { accountId, amountCents: 5000, paidOn: "2026-09-12", method: "VENMO", reason: "Overpaid" });
    payments.push(r.id);
    expect(r.amountCents).toBe(-5000);
    expect(r.refundReason).toBe("Overpaid");
    expect(await balance()).toBe(before + 5000);
  });

  it("a credit lowers the balance, a fee or tip raises it", async () => {
    const before = await balance();
    const credit = await recordAdjustment(prisma, { accountId, kind: "CREDIT", amountCents: 3000, chargedOn: "2026-09-12", description: "Missed lesson credit" });
    charges.push(credit.id);
    expect(credit.kind).toBe("ADJUSTMENT");
    expect(credit.amountCents).toBe(-3000);
    expect(await balance()).toBe(before - 3000);
    const tip = await recordAdjustment(prisma, { accountId, kind: "TIP", amountCents: 2000, chargedOn: "2026-09-12", description: "Tip" });
    charges.push(tip.id);
    expect(tip.kind).toBe("TIP");
    expect(await balance()).toBe(before - 1000);
  });

  it("voiding takes a row out of the balance but keeps it", async () => {
    const before = await balance();
    const p = await recordPayment(prisma, { accountId, amountCents: 10000, paidOn: "2026-09-12", method: "CASH" });
    payments.push(p.id);
    await voidPayment(prisma, p.id, "Entered twice");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.voidedAt).not.toBeNull();
    expect(row.voidReason).toBe("Entered twice");
    expect(await balance()).toBe(before);
    await expect(voidPayment(prisma, p.id, "again")).rejects.toThrow(/Already/);

    const fee = await recordAdjustment(prisma, { accountId, kind: "FEE", amountCents: 1500, chargedOn: "2026-09-12", description: "Materials" });
    charges.push(fee.id);
    await voidCharge(prisma, fee.id, "Waived");
    expect(await balance()).toBe(before);
  });

  it("will not void a lesson charge directly", async () => {
    const lessonCharge = await prisma.charge.findFirstOrThrow({ where: { accountId, kind: "LESSON" } });
    await expect(voidCharge(prisma, lessonCharge.id, "x")).rejects.toThrow(/Cancel the lesson/);
  });

  it("rejects bad input", async () => {
    await expect(recordPayment(prisma, { accountId, amountCents: 0, paidOn: "2026-09-12", method: "CASH" })).rejects.toThrow(PaymentError);
    await expect(recordPayment(prisma, { accountId, amountCents: 100, paidOn: "bad", method: "CASH" })).rejects.toThrow(/Date/);
    await expect(recordPayment(prisma, { accountId: "nope", amountCents: 100, paidOn: "2026-09-12", method: "CASH" })).rejects.toThrow(/Account/);
    await expect(recordRefund(prisma, { accountId, amountCents: 100, paidOn: "2026-09-12", method: "CASH", reason: " " })).rejects.toThrow(/reason/);
    await expect(recordAdjustment(prisma, { accountId, kind: "FEE", amountCents: 100, chargedOn: "2026-09-12", description: "" })).rejects.toThrow(/description/);
  });

  it("lists payments in a range with the account name", async () => {
    const p = await recordPayment(prisma, { accountId, amountCents: 7000, paidOn: "2029-02-10", method: "CARD" });
    payments.push(p.id);
    const rows = await listPayments(prisma, orgId, new Date("2029-02-01T00:00:00Z"), new Date("2029-02-28T00:00:00Z"));
    expect(rows.map((r) => r.id)).toContain(p.id);
    expect(rows.find((r) => r.id === p.id)!.accountName).toBe("Estella Urman");
  });
});
