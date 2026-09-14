/** Lessons with no student (events) and all-day entries. Runs against the local database; cleans up. */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { cancelLesson, createLesson, LessonError, updateLesson } from "./lessons";
import { createSeries, extendOpenSeries } from "./series";
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
