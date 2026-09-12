/**
 * Runs against the local resolventum_v2 database after `npm run import`.
 * Creates series for one student and removes them afterwards.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { rebuildAccountAllocations } from "./allocation";
import { cancelLessonAndFuture, createSeries, extendOpenSeries, updateLessonAndFuture } from "./series";

const NY = "America/New_York";
let studentId: string;
let accountId: string;
let orgId: string;
const seriesIds: string[] = [];

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  studentId = s.id;
  accountId = s.accountId;
  orgId = s.organizationId;
});

afterEach(async () => {
  for (const id of seriesIds.splice(0)) {
    await prisma.charge.deleteMany({ where: { lessonStudent: { lesson: { seriesId: id } } } });
    await prisma.lesson.deleteMany({ where: { seriesId: id } });
    await prisma.lessonSeries.delete({ where: { id } }).catch(() => undefined);
  }
  await rebuildAccountAllocations(prisma, accountId);
});

const base = () => ({ studentId, startsAt: new Date("2027-09-07T20:00:00Z"), durationMin: 60, subject: "Series test", priceCents: 13000 });

describe("series", () => {
  it("creates one lesson per week up to the end date, each with a charge", async () => {
    const { series, lessonIds } = await createSeries(prisma, { ...base(), until: "2027-09-28" });
    seriesIds.push(series.id);
    expect(lessonIds.length).toBe(4);
    const charges = await prisma.charge.findMany({ where: { lessonStudent: { lesson: { seriesId: series.id } } }, orderBy: { chargedOn: "asc" } });
    expect(charges.map((c) => c.chargedOn.toISOString().slice(0, 10))).toEqual(["2027-09-07", "2027-09-14", "2027-09-21", "2027-09-28"]);
    expect(charges.every((c) => c.amountCents === 13000)).toBe(true);
    expect(series.rrule).toBe("FREQ=WEEKLY");
    expect(series.endsOn?.toISOString().slice(0, 10)).toBe("2027-09-28");
  });

  it("keeps 4 pm across the November DST switch", async () => {
    const { series } = await createSeries(prisma, { ...base(), startsAt: new Date("2027-10-26T20:00:00Z"), until: "2027-11-09" });
    seriesIds.push(series.id);
    const lessons = await prisma.lesson.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    expect(lessons.map((l) => l.startsAt.toISOString())).toEqual(["2027-10-26T20:00:00.000Z", "2027-11-02T20:00:00.000Z", "2027-11-09T21:00:00.000Z"]);
  });

  it("an open series is generated to the horizon and extended later", async () => {
    const start = new Date("2027-01-05T21:00:00Z");
    const { series, lessonIds } = await createSeries(prisma, { ...base(), startsAt: start });
    seriesIds.push(series.id);
    expect(lessonIds.length).toBeGreaterThanOrEqual(25);
    expect(series.endsOn).toBeNull();
    const before = await prisma.lesson.count({ where: { seriesId: series.id } });
    const made = await extendOpenSeries(prisma, orgId, new Date("2027-06-01T00:00:00Z"));
    const after = await prisma.lesson.count({ where: { seriesId: series.id } });
    expect(made).toBeGreaterThan(0);
    expect(after - before).toBeLessThanOrEqual(made);
    const again = await extendOpenSeries(prisma, orgId, new Date("2027-06-01T00:00:00Z"));
    expect(again).toBe(0);
  });

  it("this-and-future edits change price and time of day but keep each lesson's date", async () => {
    const { series, lessonIds } = await createSeries(prisma, { ...base(), until: "2027-09-28" });
    seriesIds.push(series.id);
    const second = (await prisma.lesson.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } }))[1];
    const n = await updateLessonAndFuture(prisma, second.id, { priceCents: 14000, startsAt: new Date("2027-09-14T21:30:00Z") }, NY);
    expect(n).toBe(3);
    const lessons = await prisma.lesson.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" }, include: { students: { include: { charge: true } } } });
    expect(lessons.map((l) => l.startsAt.toISOString())).toEqual([
      "2027-09-07T20:00:00.000Z", "2027-09-14T21:30:00.000Z", "2027-09-21T21:30:00.000Z", "2027-09-28T21:30:00.000Z",
    ]);
    expect(lessons.map((l) => l.students[0].charge!.amountCents)).toEqual([13000, 14000, 14000, 14000]);
    expect(lessonIds.length).toBe(4);
  });

  it("this-and-future cancel voids the charges and closes the series", async () => {
    const { series } = await createSeries(prisma, { ...base(), until: "2027-09-28" });
    seriesIds.push(series.id);
    const third = (await prisma.lesson.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } }))[2];
    const n = await cancelLessonAndFuture(prisma, third.id, "Stopped for the season", NY);
    expect(n).toBe(2);
    const lessons = await prisma.lesson.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" }, include: { students: { include: { charge: true } } } });
    expect(lessons.map((l) => l.status)).toEqual(["SCHEDULED", "SCHEDULED", "CANCELLED", "CANCELLED"]);
    expect(lessons.map((l) => l.students[0].charge!.voidedAt !== null)).toEqual([false, false, true, true]);
    const s = await prisma.lessonSeries.findUniqueOrThrow({ where: { id: series.id } });
    expect(s.endsOn?.toISOString().slice(0, 10)).toBe("2027-09-20");
  });
});
