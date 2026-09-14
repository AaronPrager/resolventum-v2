/** Runs against the local resolventum_v2 database after `npm run import`. Cleans up what it makes. */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { archiveStudent, listStudents, unarchiveStudent } from "./students";
import { createSeries } from "./series";

const SUBJECT = `Archive test ${Date.now()}`;
let orgId: string;
let studentId: string;

afterAll(async () => {
  const lessons = await prisma.lesson.findMany({ where: { subject: SUBJECT }, select: { id: true, seriesId: true } });
  await prisma.charge.deleteMany({ where: { lessonStudent: { lessonId: { in: lessons.map((l) => l.id) } } } });
  await prisma.lessonStudent.deleteMany({ where: { lessonId: { in: lessons.map((l) => l.id) } } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessons.map((l) => l.id) } } });
  await prisma.lessonSeries.deleteMany({ where: { id: { in: lessons.map((l) => l.seriesId).filter((x): x is string => !!x) } } });
  if (studentId) await prisma.student.update({ where: { id: studentId }, data: { archivedAt: null } });
});

describe("archiving a student", () => {
  it("cancels their future solo lessons, ends their series, hides them, and can be undone", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    orgId = org.id;
    const student = await prisma.student.findFirstOrThrow({ where: { organizationId: orgId, firstName: "Estella", archivedAt: null } });
    studentId = student.id;
    const now = new Date("2030-01-01T12:00:00Z");
    await createSeries(prisma, { studentId, startsAt: new Date("2030-01-07T21:00:00Z"), durationMin: 60, priceCents: 13000, subject: SUBJECT, intervalWeeks: 1, until: "2030-02-01" });
    const before = await prisma.lesson.count({ where: { subject: SUBJECT, status: "SCHEDULED" } });
    expect(before).toBeGreaterThanOrEqual(4);

    const r = await archiveStudent(prisma, orgId, studentId, now);
    expect(r.cancelledLessons).toBe(before);
    expect(r.endedSeries).toBe(1);
    expect(await prisma.lesson.count({ where: { subject: SUBJECT, status: "SCHEDULED" } })).toBe(0);
    expect(await prisma.charge.count({ where: { lessonStudent: { lesson: { subject: SUBJECT } }, voidedAt: null } })).toBe(0);
    const series = await prisma.lessonSeries.findFirstOrThrow({ where: { lessons: { some: { subject: SUBJECT } } } });
    expect(series.endsOn?.toISOString().slice(0, 10)).toBe("2030-01-01");

    const today = new Date("2026-09-13T00:00:00Z");
    expect((await listStudents(prisma, orgId, today)).some((s) => s.id === studentId)).toBe(false);
    expect((await listStudents(prisma, orgId, today, { includeArchived: true })).find((s) => s.id === studentId)?.archived).toBe(true);

    await unarchiveStudent(prisma, orgId, studentId);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: studentId } })).archivedAt).toBeNull();
  });

  it("refuses a student from another school", async () => {
    await expect(archiveStudent(prisma, "not-an-org", studentId)).rejects.toThrow(/not found/);
  });
});
