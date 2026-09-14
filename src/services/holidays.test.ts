/** School holidays and term-time series. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { weeklyOccurrences } from "../lib/recurrence";
import { rebuildAccountAllocations } from "./allocation";
import { HolidayError, addHoliday, holidayRanges, listHolidays, removeHoliday } from "./holidays";
import { createSeries, extendOpenSeries } from "./series";

let orgId: string;
let studentId: string;
let accountId: string;
const seriesIds: string[] = [];
const holidayIds: string[] = [];

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  orgId = s.organizationId; studentId = s.id; accountId = s.accountId;
});
afterAll(async () => {
  for (const id of seriesIds) {
    await prisma.charge.deleteMany({ where: { lessonStudent: { lesson: { seriesId: id } } } });
    await prisma.lesson.deleteMany({ where: { seriesId: id } });
    await prisma.lessonSeries.delete({ where: { id } }).catch(() => undefined);
  }
  // Belt and braces: a charge whose lesson is already gone still names the test subject.
  await prisma.charge.deleteMany({ where: { accountId, lessonStudentId: null, description: { contains: "holiday series test" } } });
  await prisma.charge.deleteMany({ where: { accountId, lessonStudentId: null, description: { startsWith: "Not term-time test" } } });
  await prisma.holiday.deleteMany({ where: { id: { in: holidayIds } } });
  await rebuildAccountAllocations(prisma, accountId);
});

describe("holidays", () => {
  it("skips ranges without counting them against the limit", () => {
    const dates = weeklyOccurrences({ firstStartsAt: new Date("2033-09-06T20:00:00Z"), timeZone: "America/New_York", intervalWeeks: 1, count: 4, skip: [{ from: "2033-09-13", to: "2033-09-20" }] });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2033-09-06", "2033-09-27", "2033-10-04", "2033-10-11"]);
  });

  it("checks input and lists in date order", async () => {
    await expect(addHoliday(prisma, orgId, { name: "", startsOn: "2033-12-20", endsOn: "2033-12-31" })).rejects.toThrow(HolidayError);
    await expect(addHoliday(prisma, orgId, { name: "Bad", startsOn: "2033-12-31", endsOn: "2033-12-20" })).rejects.toThrow(/before/);
    holidayIds.push((await addHoliday(prisma, orgId, { name: "Winter break 2033", startsOn: "2033-12-19", endsOn: "2034-01-01" })).id);
    holidayIds.push((await addHoliday(prisma, orgId, { name: "Thanksgiving 2033", startsOn: "2033-11-24", endsOn: "2033-11-25" })).id);
    const names = (await listHolidays(prisma, orgId)).filter((h) => holidayIds.includes(h.id)).map((h) => h.name);
    expect(names).toEqual(["Thanksgiving 2033", "Winter break 2033"]);
    expect((await holidayRanges(prisma, orgId)).some((r) => r.from === "2033-12-19" && r.to === "2034-01-01")).toBe(true);
  });

  it("a term-time series makes no lesson on a holiday, now or when extended", async () => {
    // Thursdays from Nov 17, 2033. Nov 24 is Thanksgiving; Dec 22 and Dec 29 are in the break.
    const r = await createSeries(prisma, { studentId, startsAt: new Date("2033-11-17T21:00:00Z"), durationMin: 60, subject: "Holiday series test", priceCents: 10000, until: "2034-01-05", skipHolidays: true });
    seriesIds.push(r.series.id);
    const days = (await prisma.lesson.findMany({ where: { seriesId: r.series.id }, orderBy: { startsAt: "asc" } })).map((l) => l.startsAt.toISOString().slice(0, 10));
    expect(days).toEqual(["2033-11-17", "2033-12-01", "2033-12-08", "2033-12-15", "2034-01-05"]);

    const open = await createSeries(prisma, { studentId, startsAt: new Date("2033-12-01T21:00:00Z"), durationMin: 60, subject: "Open holiday series test", priceCents: 10000, skipHolidays: true });
    seriesIds.push(open.series.id);
    await prisma.lesson.deleteMany({ where: { seriesId: open.series.id, startsAt: { gt: new Date("2033-12-15T00:00:00Z") } } });
    await extendOpenSeries(prisma, orgId, new Date("2033-12-10T00:00:00Z"));
    const extended = (await prisma.lesson.findMany({ where: { seriesId: open.series.id }, orderBy: { startsAt: "asc" } })).map((l) => l.startsAt.toISOString().slice(0, 10));
    expect(extended.slice(0, 4)).toEqual(["2033-12-01", "2033-12-08", "2033-12-15", "2034-01-05"]);
    const plain = await createSeries(prisma, { studentId, startsAt: new Date("2033-12-22T21:00:00Z"), durationMin: 60, subject: "Not term-time test", priceCents: 10000, until: "2033-12-29" });
    seriesIds.push(plain.series.id);
    expect(plain.lessonIds).toHaveLength(2);
    await expect(createSeries(prisma, { studentId, startsAt: new Date("2033-12-22T21:00:00Z"), durationMin: 60, subject: "All holiday", priceCents: 10000, until: "2033-12-29", skipHolidays: true })).rejects.toThrow(/holiday/);
  });

  it("removes", async () => {
    const id = holidayIds.pop()!;
    await removeHoliday(prisma, orgId, id);
    await expect(removeHoliday(prisma, "other-org", holidayIds[0])).rejects.toThrow(/not found/);
  });
});
