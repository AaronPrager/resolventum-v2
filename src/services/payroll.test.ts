/** Tutor pay for a month, recording it once, and the slip. Cleans up. */
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { tutorSlip } from "../documents/tutorSlipPdf";
import { cancelLesson, createLesson } from "./lessons";
import { PayrollError, monthBounds, recordTutorPay, tutorMonth } from "./payroll";

const TAG = `Paytest${Date.now()}`;
let orgId: string;
let tutorId: string;
const lessonIds: string[] = [];

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } })).id;
  tutorId = (await prisma.tutor.create({ data: { organizationId: orgId, name: `${TAG} Tutor`, hourlyPayRateCents: 4000 } })).id;
  for (const [iso, min] of [["2031-02-03T20:00:00Z", 60], ["2031-02-10T20:00:00Z", 90], ["2031-02-17T20:00:00Z", 60], ["2031-03-01T20:00:00Z", 60]] as const) {
    lessonIds.push((await createLesson(prisma, { organizationId: orgId, tutorId, startsAt: new Date(iso), durationMin: min, subject: `${TAG} block`, priceCents: 0 })).id);
  }
  await cancelLesson(prisma, lessonIds[2]);
});

afterAll(async () => {
  await prisma.expense.deleteMany({ where: { tutorId } });
  await prisma.vendor.deleteMany({ where: { organizationId: orgId, name: `${TAG} Tutor` } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
  await prisma.tutor.delete({ where: { id: tutorId } });
});

describe("tutor pay", () => {
  it("counts the month's lessons that were not cancelled", async () => {
    const m = await tutorMonth(prisma, orgId, tutorId, "2031-02");
    expect(m.lessons).toHaveLength(2);
    expect(m.minutes).toBe(150);
    expect(m.payCents).toBe(10000);
    expect(m.label).toBe("February 2031");
    expect(m.recorded).toBeNull();
  });

  it("records the pay once as a Contract Labor expense on the last day", async () => {
    const e = await recordTutorPay(prisma, orgId, tutorId, "2031-02");
    expect(e.amountCents).toBe(10000);
    expect(e.spentOn.toISOString().slice(0, 10)).toBe("2031-02-28");
    expect((await prisma.expenseCategory.findUniqueOrThrow({ where: { id: e.categoryId } })).name).toBe("Contract Labor");
    await expect(recordTutorPay(prisma, orgId, tutorId, "2031-02")).rejects.toThrow(/already recorded/);
    await expect(recordTutorPay(prisma, orgId, tutorId, "2031-04")).rejects.toThrow(/no hours/);
    expect((await tutorMonth(prisma, orgId, tutorId, "2031-02")).recorded?.id).toBe(e.id);
  });

  it("makes a slip PDF, and checks input", async () => {
    const slip = await tutorSlip(prisma, orgId, tutorId, "2031-02", new Date("2031-03-01T00:00:00Z"));
    expect(slip.filename).toBe(`Pay slip - ${TAG} Tutor - 2031-02.pdf`);
    expect((await PDFDocument.load(slip.bytes)).getPageCount()).toBe(1);
    expect(() => monthBounds("2031-2")).toThrow(PayrollError);
    await expect(tutorMonth(prisma, "other-org", tutorId, "2031-02")).rejects.toThrow(/not found/);
  });
});
