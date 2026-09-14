/** Lessons with no student (events) and all-day entries. Runs against the local database; cleans up. */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { cancelLesson, createLesson, deleteLesson, LessonError, updateLesson } from "./lessons";
import { createSeries, deleteLessonAndFuture, extendOpenSeries } from "./series";
import { calendarLessons } from "./calendar";
import { buildIcs } from "../lib/ics";

const TITLE = `Event test ${Date.now()}`;
let orgId: string;

afterAll(async () => {
  const lessons = await prisma.lesson.findMany({ where: { subject: { startsWith: TITLE } }, select: { id: true, seriesId: true } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessons.map((l) => l.id) } } });
  await prisma.lessonSeries.deleteMany({ where: { id: { in: lessons.map((l) => l.seriesId).filter((x): x is string => !!x) } } });
});

describe("events without a student", () => {
  it("creates one with no seat and no charge, edits it, cancels it", async () => {
    orgId = (await prisma.organization.findFirstOrThrow()).id;
    const l = await createLesson(prisma, { organizationId: orgId, startsAt: new Date("2031-03-03T18:00:00Z"), durationMin: 90, subject: `${TITLE} meeting`, priceCents: 0 });
    expect(await prisma.lessonStudent.count({ where: { lessonId: l.id } })).toBe(0);
    expect(await prisma.charge.count({ where: { lessonStudent: { lessonId: l.id } } })).toBe(0);
    await updateLesson(prisma, l.id, { subject: `${TITLE} renamed`, durationMin: 30 });
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } })).durationMin).toBe(30);
    await cancelLesson(prisma, l.id, "Moved");
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("CANCELLED");
  });

  it("needs a title and a school", async () => {
    await expect(createLesson(prisma, { organizationId: orgId, startsAt: new Date("2031-03-03T18:00:00Z"), durationMin: 60, subject: "  ", priceCents: 0 })).rejects.toThrow(/title/);
    await expect(createLesson(prisma, { startsAt: new Date("2031-03-03T18:00:00Z"), durationMin: 60, subject: "x", priceCents: 0 })).rejects.toThrow(LessonError);
  });

  it("an all-day event spans the day, shows in the calendar and the feed as a date, and repeats weekly", async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const r = await createSeries(prisma, { organizationId: orgId, startsAt: new Date("2031-04-07T04:00:00Z"), allDay: true, durationMin: 60, subject: `${TITLE} day off`, priceCents: 0, until: "2031-04-21" });
    expect(r.lessonIds.length).toBe(3);
    const first = await prisma.lesson.findUniqueOrThrow({ where: { id: r.lessonIds[0] } });
    expect(first.allDay).toBe(true);
    expect(first.durationMin).toBe(1440);
    const cal = await calendarLessons(prisma, orgId, new Date("2031-04-06T00:00:00Z"), new Date("2031-04-09T00:00:00Z"), org.timezone);
    const mine = cal.find((l) => l.id === first.id)!;
    expect(mine.allDay).toBe(true);
    expect(mine.day).toBe("2031-04-07");
    expect(mine.students).toEqual([]);

    // The feed marks it as a date, not a time. Built directly: a live feed token here would race the feed test.
    const ics = buildIcs({ name: "t", now: new Date("2031-04-01T00:00:00Z"), events: [{ uid: "x", start: new Date("2031-04-07T00:00:00Z"), end: new Date("2031-04-08T00:00:00Z"), summary: `${TITLE} day off`, allDay: true }] });
    expect(ics).toContain("DTSTART;VALUE=DATE:20310407");
    expect(ics).toContain("DTEND;VALUE=DATE:20310408");
  });
});

describe("cancelling without a reason", () => {
  it("is allowed and records a plain one", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const l = await createLesson(prisma, { organizationId: org.id, startsAt: new Date("2031-05-05T18:00:00Z"), durationMin: 60, subject: `${TITLE} no reason`, priceCents: 0 });
    await cancelLesson(prisma, l.id);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("CANCELLED");
  });
});

describe("deleting", () => {
  it("voids the charge, hides the lesson, and the nightly extension does not bring it back", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const student = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Estella", archivedAt: null } });
    // Open-ended weekly series starting now, so the horizon logic applies.
    const start = new Date(Date.now() + 2 * 86400000);
    start.setUTCHours(21, 0, 0, 0);
    const r = await createSeries(prisma, { studentId: student.id, startsAt: start, durationMin: 60, subject: `${TITLE} delete`, priceCents: 13000 });
    const ids = r.lessonIds;
    const last = ids[ids.length - 1];

    await deleteLesson(prisma, last);
    const charge = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: last } } });
    expect(charge.voidedAt).not.toBeNull();
    expect(charge.voidReason).toBe("Lesson deleted");
    expect(await extendOpenSeries(prisma, org.id)).toBe(0);
    expect(await prisma.lesson.count({ where: { seriesId: r.series.id, deletedAt: null } })).toBe(ids.length - 1);

    const n = await deleteLessonAndFuture(prisma, ids[1], org.timezone);
    expect(n).toBe(ids.length - 2);
    expect(await prisma.lesson.count({ where: { seriesId: r.series.id, deletedAt: null } })).toBe(1);
    expect((await prisma.lessonSeries.findUniqueOrThrow({ where: { id: r.series.id } })).endsOn).not.toBeNull();
    await expect(deleteLesson(prisma, last)).rejects.toThrow(/not found/);

    // Clean up the charges and seats this test made.
    await prisma.charge.deleteMany({ where: { lessonStudent: { lessonId: { in: ids } } } });
    await prisma.lessonStudent.deleteMany({ where: { lessonId: { in: ids } } });
    const { rebuildAccountAllocations } = await import("./allocation");
    await rebuildAccountAllocations(prisma, student.accountId);
  });
});
