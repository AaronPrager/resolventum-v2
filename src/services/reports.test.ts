/** Runs against the local resolventum_v2 database after `npm run import`. Read-only. */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { monthlyReport, studentsByRevenue, tutorPay, yearSummary } from "./reports";

let orgId: string;
beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow()).id;
});

describe("reports", () => {
  it("monthly report for 2025 adds up to the imported payments", async () => {
    const rows = await monthlyReport(prisma, orgId, 2025);
    expect(rows.length).toBe(12);
    expect(rows.reduce((s, r) => s + r.paidCents, 0)).toBe(4260500);
    expect(rows.reduce((s, r) => s + r.refundedCents, 0)).toBe(0);
    expect(rows[0].month).toBe("2025-01");
    expect(rows.some((r) => r.lessons > 0)).toBe(true);
    expect(rows.reduce((s, r) => s + r.expenseCents, 0)).toBeGreaterThan(0);
  });

  it("year summary is consistent with itself", async () => {
    const y = await yearSummary(prisma, orgId, 2025, new Date("2026-09-12T00:00:00Z"));
    expect(y.receivedCents).toBe(4260500);
    expect(y.netIncomeCents).toBe(y.receivedCents - y.refundedCents);
    expect(y.profitCents).toBe(y.netIncomeCents - y.deductibleCents);
    expect(y.deductibleCents).toBeLessThanOrEqual(y.expenseCents);
    expect(y.activeStudents).toBeGreaterThan(10);
    expect(y.hours).toBeGreaterThan(100);
    expect(y.averageLessonCents).toBeGreaterThan(5000);
    expect(y.outstandingCents).toBeGreaterThan(0);
  });

  it("tutor pay counts lessons and pays nothing when no rate is set", async () => {
    const rows = await tutorPay(prisma, orgId, new Date("2026-01-01T00:00:00Z"), new Date("2026-07-01T00:00:00Z"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const yakov = rows.find((r) => r.tutorName.startsWith("Yakov"))!;
    const expected = await prisma.lesson.count({ where: { tutorId: yakov.tutorId, status: { not: "CANCELLED" }, startsAt: { gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2026-07-01T00:00:00Z") } } });
    expect(yakov.lessons).toBe(expected);
    expect(yakov.payCents).toBeNull();
  });

  it("students by revenue is sorted and non-empty", async () => {
    const rows = await studentsByRevenue(prisma, orgId, 2026);
    expect(rows.length).toBeGreaterThan(5);
    for (let i = 1; i < rows.length; i++) expect(rows[i].chargedCents).toBeLessThanOrEqual(rows[i - 1].chargedCents);
  });
});
