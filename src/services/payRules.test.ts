/** Pay rules: per hour, percent of the price, and per-subject overrides. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createLesson } from "./lessons";
import { describeTutorPay, payForLesson, payRuleFor, tutorMonth } from "./payroll";
import { tutorPay } from "./reports";

const TAG = `Ruletest${Date.now()}`;
let orgId: string;
let tutorId: string;
let studentId: string;
let accountId: string;
const lessonIds: string[] = [];

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  orgId = s.organizationId; studentId = s.id; accountId = s.accountId;
  tutorId = (await prisma.tutor.create({ data: { organizationId: orgId, name: `${TAG} Tutor`, hourlyPayRateCents: 4000, payRates: { create: [{ subject: "SAT Math", payPercent: 50 }, { subject: "Chemistry", hourlyPayRateCents: 6000 }] } } })).id;
  for (const [iso, min, subject, price] of [["2032-02-03T20:00:00Z", 60, "Algebra", 12000], ["2032-02-10T20:00:00Z", 90, "sat math", 30000], ["2032-02-17T20:00:00Z", 30, "Chemistry", 8000]] as const) {
    lessonIds.push((await createLesson(prisma, { studentId, tutorId, startsAt: new Date(iso), durationMin: min, subject, priceCents: price })).id);
  }
});
afterAll(async () => {
  await prisma.charge.deleteMany({ where: { lessonStudent: { lessonId: { in: lessonIds } } } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
  await prisma.tutor.delete({ where: { id: tutorId } });
  const { rebuildAccountAllocations } = await import("./allocation");
  await rebuildAccountAllocations(prisma, accountId);
});

describe("pay rules", () => {
  it("picks the subject's rule, case-insensitive, else the default; percent wins", () => {
    const t = { hourlyPayRateCents: 4000, payPercent: null, payRates: [{ subject: "SAT Math", hourlyPayRateCents: null, payPercent: 50 }] };
    expect(payRuleFor(t, "sat math ")).toEqual({ hourlyCents: null, percent: 50 });
    expect(payRuleFor(t, "Algebra")).toEqual({ hourlyCents: 4000, percent: null });
    expect(payForLesson({ hourlyCents: 4000, percent: 50 }, 60, 10000)).toBe(5000);
    expect(payForLesson({ hourlyCents: 4000, percent: null }, 90, 10000)).toBe(6000);
    expect(payForLesson({ hourlyCents: null, percent: null }, 60, 10000)).toBeNull();
    expect(describeTutorPay(t)).toBe("$40.00 per hour, by subject for SAT Math");
    expect(describeTutorPay({ hourlyPayRateCents: null, payPercent: 40, payRates: [] })).toBe("40% of the lesson price");
  });

  it("the month adds up per lesson", async () => {
    const m = await tutorMonth(prisma, orgId, tutorId, "2032-02");
    expect(m.lessons.map((l) => l.payCents)).toEqual([4000, 15000, 3000]);
    expect(m.lessons[1].basis).toBe("50% of $300.00");
    expect(m.payCents).toBe(22000);
    expect(m.unpriced).toBe(0);
    const row = (await tutorPay(prisma, orgId, new Date("2032-02-01T00:00:00Z"), new Date("2032-03-01T00:00:00Z"))).find((r) => r.tutorId === tutorId)!;
    expect(row).toMatchObject({ lessons: 3, minutes: 180, chargedCents: 50000, payCents: 22000 });
  });

  it("a tutor with no rules has no pay figure; a partial gap is counted", async () => {
    await prisma.tutor.update({ where: { id: tutorId }, data: { hourlyPayRateCents: null } });
    const m = await tutorMonth(prisma, orgId, tutorId, "2032-02");
    expect(m.unpriced).toBe(1);
    expect(m.payCents).toBe(18000);
    await prisma.tutorPayRate.deleteMany({ where: { tutorId } });
    expect((await tutorMonth(prisma, orgId, tutorId, "2032-02")).payCents).toBeNull();
  });
});
