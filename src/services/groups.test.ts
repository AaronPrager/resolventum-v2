/** Group lessons: several students, each with a price and a charge on their own account. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { accountBalances } from "./balances";
import { LessonError, cancelLesson, createLesson, restoreLesson, updateLesson } from "./lessons";
import { createStudent } from "./people";
import { createSeries, extendOpenSeries } from "./series";

const TAG = `Grouptest${Date.now()}`;
let orgId: string;
const ids: Record<string, { id: string; accountId: string }> = {};
const lessonIds: string[] = [];

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } })).id;
  for (const n of ["Ada", "Bo", "Cy"]) {
    const s = await createStudent(prisma, orgId, { firstName: n, lastName: TAG }, { accountName: `${n} ${TAG}` });
    ids[n] = { id: s.id, accountId: s.accountId };
  }
});

afterAll(async () => {
  const accountIds = Object.values(ids).map((x) => x.accountId);
  const seats = await prisma.lessonStudent.findMany({ where: { studentId: { in: Object.values(ids).map((x) => x.id) } }, select: { lessonId: true } });
  const all = [...new Set([...lessonIds, ...seats.map((s) => s.lessonId)])];
  const lessons = await prisma.lesson.findMany({ where: { OR: [{ id: { in: all } }, { subject: { startsWith: TAG } }] }, select: { id: true, seriesId: true } });
  await prisma.allocation.deleteMany({ where: { charge: { accountId: { in: accountIds } } } });
  await prisma.charge.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.lessonStudent.deleteMany({ where: { lessonId: { in: lessons.map((l) => l.id) } } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessons.map((l) => l.id) } } });
  await prisma.lessonSeries.deleteMany({ where: { id: { in: lessons.map((l) => l.seriesId).filter((x): x is string => !!x) } } });
  await prisma.student.deleteMany({ where: { lastName: TAG } });
  await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
});

const balance = async (accountId: string, asOf = new Date("2032-12-31T00:00:00Z")) =>
  (await accountBalances(prisma, orgId, asOf)).find((b) => b.accountId === accountId)?.balanceCents ?? 0;

describe("group lessons", () => {
  it("charges each student on their own account at their own price", async () => {
    const l = await createLesson(prisma, { seats: [{ studentId: ids.Ada.id, priceCents: 6000 }, { studentId: ids.Bo.id, priceCents: 5000 }], startsAt: new Date("2032-03-01T20:00:00Z"), durationMin: 90, subject: `${TAG} chemistry`, priceCents: 0 });
    lessonIds.push(l.id);
    const seats = await prisma.lessonStudent.findMany({ where: { lessonId: l.id }, include: { charge: true } });
    expect(seats).toHaveLength(2);
    expect(seats.every((s) => s.charge?.description === `${TAG} chemistry (group), 90 min`)).toBe(true);
    expect(await balance(ids.Ada.accountId)).toBe(6000);
    expect(await balance(ids.Bo.accountId)).toBe(5000);
  });

  it("changing the roster voids the leaver, charges the joiner, and reprices the stayer", async () => {
    const l = lessonIds[0];
    await updateLesson(prisma, l, { seats: [{ studentId: ids.Ada.id, priceCents: 5500 }, { studentId: ids.Cy.id, priceCents: 4000 }] });
    const seats = await prisma.lessonStudent.findMany({ where: { lessonId: l }, include: { charge: true } });
    expect(seats.map((s) => s.studentId).sort()).toEqual([ids.Ada.id, ids.Cy.id].sort());
    expect(await balance(ids.Ada.accountId)).toBe(5500);
    expect(await balance(ids.Bo.accountId)).toBe(0);
    expect(await balance(ids.Cy.accountId)).toBe(4000);
    const bo = await prisma.charge.findFirstOrThrow({ where: { studentId: ids.Bo.id } });
    expect(bo.voidedAt).not.toBeNull();
    expect(bo.lessonStudentId).toBeNull();
    expect(bo.voidReason).toBe("Taken off the lesson");
  });

  it("cancel voids every seat; restore brings back the current roster only", async () => {
    const l = lessonIds[0];
    await cancelLesson(prisma, l);
    expect(await balance(ids.Ada.accountId)).toBe(0);
    expect(await balance(ids.Cy.accountId)).toBe(0);
    await expect(updateLesson(prisma, l, { seats: [{ studentId: ids.Ada.id, priceCents: 5500 }] })).rejects.toThrow(/Restore the lesson/);
    await restoreLesson(prisma, l);
    expect(await balance(ids.Ada.accountId)).toBe(5500);
    expect(await balance(ids.Cy.accountId)).toBe(4000);
    expect(await balance(ids.Bo.accountId)).toBe(0);
  });

  it("an emptied roster turns the lesson into an event", async () => {
    const l = await createLesson(prisma, { seats: [{ studentId: ids.Bo.id, priceCents: 3000 }], startsAt: new Date("2032-04-01T20:00:00Z"), durationMin: 60, subject: `${TAG} solo`, priceCents: 0 });
    lessonIds.push(l.id);
    await updateLesson(prisma, l.id, { seats: [] });
    expect(await prisma.lessonStudent.count({ where: { lessonId: l.id } })).toBe(0);
    expect(await balance(ids.Bo.accountId)).toBe(0);
  });

  it("refuses a student listed twice or from another school", async () => {
    await expect(createLesson(prisma, { seats: [{ studentId: ids.Ada.id, priceCents: 1 }, { studentId: ids.Ada.id, priceCents: 1 }], startsAt: new Date("2032-05-01T20:00:00Z"), durationMin: 60, subject: "x", priceCents: 0 })).rejects.toThrow(/twice/);
    await expect(createLesson(prisma, { organizationId: "another-school", seats: [{ studentId: ids.Ada.id, priceCents: 1 }], startsAt: new Date("2032-05-01T20:00:00Z"), durationMin: 60, subject: "x", priceCents: 0 })).rejects.toThrow(LessonError);
  });

  it("a weekly group series carries the roster forward and drops an archived student", async () => {
    const start = new Date(Date.now() + 3 * 86400000);
    start.setUTCHours(21, 0, 0, 0);
    const r = await createSeries(prisma, { seats: [{ studentId: ids.Ada.id, priceCents: 5000 }, { studentId: ids.Cy.id, priceCents: 5000 }], startsAt: start, durationMin: 60, subject: `${TAG} group series`, priceCents: 0 });
    expect(await prisma.lessonStudent.count({ where: { lessonId: r.lessonIds[0] } })).toBe(2);
    // Pretend the last month was never generated, and Cy left.
    const tail = r.lessonIds.slice(-4);
    await prisma.charge.deleteMany({ where: { lessonStudent: { lessonId: { in: tail } } } });
    await prisma.lessonStudent.deleteMany({ where: { lessonId: { in: tail } } });
    await prisma.lesson.deleteMany({ where: { id: { in: tail } } });
    await prisma.student.update({ where: { id: ids.Cy.id }, data: { archivedAt: new Date() } });
    const made = await extendOpenSeries(prisma, orgId);
    expect(made).toBeGreaterThanOrEqual(4);
    const fresh = await prisma.lesson.findMany({ where: { seriesId: r.series.id }, orderBy: { startsAt: "desc" }, take: 1, include: { students: true } });
    expect(fresh[0].students.map((s) => s.studentId)).toEqual([ids.Ada.id]);
    await prisma.student.update({ where: { id: ids.Cy.id }, data: { archivedAt: null } });
  });
});
