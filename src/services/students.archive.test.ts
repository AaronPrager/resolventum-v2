/** Runs against the local resolventum_v2 database after `npm run import`. Cleans up what it makes. */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { archiveCandidates, archiveStudent, listStudents, setStudentStatus, studentChoices, unarchiveStudent } from "./students";
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
  if (studentId) await prisma.student.update({ where: { id: studentId }, data: { archivedAt: null, status: "ACTIVE" } });
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

describe("student status", () => {
  it("pausing stops future solo lessons, leaves the pickers, keeps the list; active again restores nothing", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const student = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Estella", archivedAt: null } });
    const now = new Date("2030-06-01T12:00:00Z");
    const { series } = await createSeries(prisma, { studentId: student.id, startsAt: new Date("2030-06-04T21:00:00Z"), durationMin: 60, priceCents: 13000, subject: SUBJECT, intervalWeeks: 1, until: "2030-07-01" });
    const r = await setStudentStatus(prisma, org.id, student.id, "PAUSED", now);
    expect(r).toMatchObject({ changed: true, cancelledLessons: 4, endedSeries: 1 });
    expect(await prisma.lesson.count({ where: { seriesId: series.id, status: "SCHEDULED" } })).toBe(0);
    expect((await prisma.charge.findFirst({ where: { lessonStudent: { lesson: { seriesId: series.id } } } }))?.voidReason).toBe("Student paused");
    expect((await studentChoices(prisma, org.id)).some((c) => c.id === student.id)).toBe(false);
    expect((await studentChoices(prisma, org.id, [student.id])).some((c) => c.id === student.id)).toBe(true);
    expect((await listStudents(prisma, org.id, new Date("2030-06-01T00:00:00Z"))).find((s) => s.id === student.id)?.status).toBe("PAUSED");
    expect(await setStudentStatus(prisma, org.id, student.id, "PAUSED", now)).toMatchObject({ changed: false });
    expect(await setStudentStatus(prisma, org.id, student.id, "ACTIVE", now)).toMatchObject({ changed: true, cancelledLessons: 0 });
    expect(await prisma.lesson.count({ where: { seriesId: series.id, status: "SCHEDULED" } })).toBe(0);
  });

  it("lists active students with nothing in 60 days as archive candidates", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const estella = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Estella" } });
    // Well after every lesson in the import, everyone is dormant; the day after her last lesson, Estella is not.
    const far = await archiveCandidates(prisma, org.id, new Date("2040-01-01T00:00:00Z"));
    expect(far.map((c) => c.id)).toContain(estella.id);
    expect(far.find((c) => c.id === estella.id)?.lastLessonAt).not.toBeNull();
    const soon = await archiveCandidates(prisma, org.id, new Date("2025-12-14T00:00:00Z"));
    expect(soon.map((c) => c.id)).not.toContain(estella.id);
  });
});

describe("one switch for active, paused, archived", () => {
  it("moves through every state and back, and archived wins over the status column", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const student = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Estella", archivedAt: null } });
    const now = new Date("2031-01-01T12:00:00Z");
    const { setStudentState, studentState } = await import("./students");
    expect(await setStudentState(prisma, org.id, student.id, "ACTIVE", now)).toMatchObject({ changed: false, from: "ACTIVE" });
    expect(await setStudentState(prisma, org.id, student.id, "PAUSED", now)).toMatchObject({ changed: true, from: "ACTIVE" });
    expect(await setStudentState(prisma, org.id, student.id, "ARCHIVED", now)).toMatchObject({ changed: true, from: "PAUSED" });
    let s = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(studentState(s)).toBe("ARCHIVED");
    expect(s.status).toBe("PAUSED");
    expect(await setStudentState(prisma, org.id, student.id, "PAUSED", now)).toMatchObject({ changed: true, from: "ARCHIVED" });
    s = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(s.archivedAt).toBeNull();
    expect(studentState(s)).toBe("PAUSED");
    expect(await setStudentState(prisma, org.id, student.id, "ACTIVE", now)).toMatchObject({ changed: true, from: "PAUSED" });
    expect(studentState(await prisma.student.findUniqueOrThrow({ where: { id: student.id } }))).toBe("ACTIVE");
    await expect(setStudentState(prisma, "not-an-org", student.id, "ACTIVE", now)).rejects.toThrow(/not found/);
  });
});
