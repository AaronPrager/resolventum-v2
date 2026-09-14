/** Editing payments, marking a tax year, and income by kind. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { accountBalances } from "./balances";
import { createLesson } from "./lessons";
import { createStudent } from "./people";
import { PaymentError, recordPayment, recordRefund, updatePayment, voidPayment } from "./payments";
import { incomeByKind, yearSummary } from "./reports";
import { setYearReported, taxFilingStatus } from "./taxFiling";

const TAG = `Moneytest${Date.now()}`;
let orgId: string;
let accountId: string;

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } })).id;
  const s = await createStudent(prisma, orgId, { firstName: "Pay", lastName: TAG }, {});
  accountId = s.accountId;
  await createLesson(prisma, { studentId: s.id, startsAt: new Date("2099-03-02T20:00:00Z"), durationMin: 60, subject: "x", priceCents: 10000 });
});

afterAll(async () => {
  await prisma.allocation.deleteMany({ where: { OR: [{ charge: { accountId } }, { payment: { accountId } }] } });
  await prisma.payment.deleteMany({ where: { accountId } });
  await prisma.charge.deleteMany({ where: { accountId } });
  const seats = await prisma.lessonStudent.findMany({ where: { student: { lastName: TAG } }, select: { lessonId: true } });
  await prisma.lessonStudent.deleteMany({ where: { student: { lastName: TAG } } });
  await prisma.lesson.deleteMany({ where: { id: { in: seats.map((s) => s.lessonId) } } });
  await prisma.expense.deleteMany({ where: { description: { startsWith: TAG } } });
  await prisma.student.deleteMany({ where: { lastName: TAG } });
  await prisma.account.deleteMany({ where: { id: accountId } });
});

const bal = async () => (await accountBalances(prisma, orgId, new Date("2099-12-31T00:00:00Z"))).find((b) => b.accountId === accountId)!.balanceCents;

describe("editing payments", () => {
  it("changes amount, date, and method, and the balance follows", async () => {
    const p = await recordPayment(prisma, { accountId, amountCents: 4000, paidOn: "2099-03-05", method: "VENMO" });
    expect(await bal()).toBe(6000);
    await updatePayment(prisma, orgId, p.id, { amountCents: 10000, paidOn: "2099-03-06", method: "ZELLE", reference: "memo 12" });
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect([after.amountCents, after.method, after.reference, after.paidOn.toISOString().slice(0, 10)]).toEqual([10000, "ZELLE", "memo 12", "2099-03-06"]);
    expect(await bal()).toBe(0);
    expect(await prisma.allocation.aggregate({ where: { paymentId: p.id }, _sum: { amountCents: true } })).toMatchObject({ _sum: { amountCents: 10000 } });
  });

  it("keeps a refund negative, needs its reason, and refuses voided or reported rows", async () => {
    const r = await recordRefund(prisma, { accountId, amountCents: 1000, paidOn: "2099-03-07", method: "ZELLE", reason: "overpaid" });
    await expect(updatePayment(prisma, orgId, r.id, { amountCents: 1500, paidOn: "2099-03-07", method: "ZELLE" })).rejects.toThrow(/reason/);
    await updatePayment(prisma, orgId, r.id, { amountCents: 1500, paidOn: "2099-03-07", method: "ZELLE", refundReason: "overpaid twice" });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: r.id } })).amountCents).toBe(-1500);
    await voidPayment(prisma, r.id, "test");
    await expect(updatePayment(prisma, orgId, r.id, { amountCents: 1, paidOn: "2099-03-07", method: "ZELLE", refundReason: "x" })).rejects.toThrow(/voided/);
    await expect(updatePayment(prisma, "other-org", r.id, { amountCents: 1, paidOn: "2099-03-07", method: "ZELLE" })).rejects.toThrow(PaymentError);
  });
});

describe("marking a tax year as reported", () => {
  it("marks every payment and expense in the year, blocks edits, and unmarks", async () => {
    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Supplies" } });
    await prisma.expense.create({ data: { organizationId: orgId, spentOn: new Date("2099-05-01T00:00:00Z"), description: `${TAG} paper`, amountCents: 500, categoryId: cat.id, taxTreatment: "BUSINESS_DIRECT" } });
    const before = await taxFilingStatus(prisma, orgId, 2099);
    expect(before.paymentsReported).toBe(0);
    const marked = await setYearReported(prisma, orgId, 2099, true);
    expect(marked.payments).toBe(before.payments);
    expect(marked.expenses).toBe(before.expenses);
    const p = await prisma.payment.findFirstOrThrow({ where: { accountId, voidedAt: null } });
    await expect(updatePayment(prisma, orgId, p.id, { amountCents: 1, paidOn: "2099-03-06", method: "ZELLE" })).rejects.toThrow(/reported on a tax return/);
    expect(await setYearReported(prisma, orgId, 2099, true)).toEqual({ payments: 0, expenses: 0 });
    await setYearReported(prisma, orgId, 2099, false);
    expect((await taxFilingStatus(prisma, orgId, 2099)).paymentsReported).toBe(0);
  });
});

describe("income by kind", () => {
  it("splits 2025 receipts and adds back up to what came in", async () => {
    const k = await incomeByKind(prisma, orgId, 2025);
    const y = await yearSummary(prisma, orgId, 2025, new Date("2026-09-13T00:00:00Z"));
    expect(k.receivedCents).toBe(y.receivedCents);
    const parts = k.lessonsByCategory.reduce((s, c) => s + c.cents, 0) + k.uncategorizedLessonsCents + k.feesCents + k.tipsCents + k.otherChargesCents + k.unappliedCents;
    expect(parts).toBe(k.receivedCents);
    expect(k.unappliedCents).toBeGreaterThanOrEqual(0);
  });
});
