/**
 * Runs against the local resolventum_v2 database after `npm run import`.
 * Each test creates lessons for one student and removes them afterwards, so
 * the imported data is left as it was.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { rebuildAccountAllocations } from "./allocation";
import { accountBalances } from "./balances";
import { LessonError, cancelLesson, createLesson, restoreLesson, updateLesson } from "./lessons";

let studentId: string;
let accountId: string;
let orgId: string;
const created: string[] = [];

async function balance() {
  const rows = await accountBalances(prisma, orgId, new Date("2030-01-01T00:00:00Z"));
  return rows.find((r) => r.accountId === accountId)!.balanceCents;
}

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  studentId = s.id;
  accountId = s.accountId;
  orgId = s.organizationId;
});

afterEach(async () => {
  for (const id of created.splice(0)) {
    await prisma.charge.deleteMany({ where: { lessonStudent: { lessonId: id } } });
    await prisma.lesson.delete({ where: { id } }).catch(() => undefined);
  }
  await rebuildAccountAllocations(prisma, accountId);
});

describe("lessons", () => {
  it("creates a lesson with its seat and charge, and the balance moves", async () => {
    const before = await balance();
    const lesson = await createLesson(prisma, {
      studentId,
      startsAt: new Date("2027-03-20T20:00:00Z"),
      durationMin: 60,
      subject: "Algebra",
      priceCents: 13000,
    });
    created.push(lesson.id);
    const charge = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: lesson.id } } });
    expect(charge.amountCents).toBe(13000);
    expect(charge.chargedOn.toISOString().slice(0, 10)).toBe("2027-03-20");
    expect(charge.description).toBe("Algebra, 60 min");
    expect(lesson.status).toBe("SCHEDULED");
    expect(await balance()).toBe(before + 13000);
  });

  it("puts the charge on the New York date of an evening lesson", async () => {
    const lesson = await createLesson(prisma, {
      studentId,
      startsAt: new Date("2027-05-01T00:30:00Z"), // 8:30 pm April 30 in New York
      durationMin: 45,
      subject: "Geometry",
      priceCents: 10000,
    });
    created.push(lesson.id);
    const charge = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: lesson.id } } });
    expect(charge.chargedOn.toISOString().slice(0, 10)).toBe("2027-04-30");
  });

  it("keeps the charge in step when the lesson is edited", async () => {
    const lesson = await createLesson(prisma, {
      studentId, startsAt: new Date("2027-03-20T20:00:00Z"), durationMin: 60, subject: "Algebra", priceCents: 13000,
    });
    created.push(lesson.id);
    await updateLesson(prisma, lesson.id, { priceCents: 14000, durationMin: 90, startsAt: new Date("2027-03-21T20:00:00Z") });
    const charge = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: lesson.id } } });
    expect(charge.amountCents).toBe(14000);
    expect(charge.description).toBe("Algebra, 90 min");
    expect(charge.chargedOn.toISOString().slice(0, 10)).toBe("2027-03-21");
  });

  it("cancelling voids the charge and restoring brings it back", async () => {
    const before = await balance();
    const lesson = await createLesson(prisma, {
      studentId, startsAt: new Date("2027-03-20T20:00:00Z"), durationMin: 60, subject: "Algebra", priceCents: 13000,
    });
    created.push(lesson.id);
    await cancelLesson(prisma, lesson.id, "Student sick");
    const charge = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: lesson.id } } });
    expect(charge.voidedAt).not.toBeNull();
    expect(charge.voidReason).toBe("Student sick");
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).status).toBe("CANCELLED");
    expect(await balance()).toBe(before);

    await restoreLesson(prisma, lesson.id);
    expect(await balance()).toBe(before + 13000);
  });

  it("can cancel and still charge", async () => {
    const before = await balance();
    const lesson = await createLesson(prisma, {
      studentId, startsAt: new Date("2027-03-20T20:00:00Z"), durationMin: 60, subject: "Algebra", priceCents: 13000,
    });
    created.push(lesson.id);
    await cancelLesson(prisma, lesson.id, "Late cancel", { chargeAnyway: true });
    expect(await balance()).toBe(before + 13000);
  });

  it("rejects bad input", async () => {
    await expect(createLesson(prisma, { studentId, startsAt: new Date("x"), durationMin: 60, subject: "A", priceCents: 1 })).rejects.toThrow(LessonError);
    await expect(createLesson(prisma, { studentId, startsAt: new Date(), durationMin: 0, subject: "A", priceCents: 1 })).rejects.toThrow(/Duration/);
    await expect(createLesson(prisma, { studentId, startsAt: new Date(), durationMin: 60, subject: " ", priceCents: 1 })).rejects.toThrow(/Subject/);
    await expect(createLesson(prisma, { studentId, startsAt: new Date(), durationMin: 60, subject: "A", priceCents: -1 })).rejects.toThrow(/Price/);
    await expect(createLesson(prisma, { studentId: "nope", startsAt: new Date(), durationMin: 60, subject: "A", priceCents: 1 })).rejects.toThrow(/Student/);
  });
});
