/**
 * School holidays. A series marked term-time only makes no lessons on these
 * days. Ranges are calendar dates in the school's zone, inclusive both ends.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr, dateOnlyStr } from "../lib/tz";
import type { DateRange } from "../lib/recurrence";

export class HolidayError extends Error {}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export interface HolidayInput {
  name: string;
  /** "YYYY-MM-DD" */
  startsOn: string;
  /** "YYYY-MM-DD", same day for a one-day holiday. */
  endsOn: string;
}

export async function addHoliday(db: PrismaClient, organizationId: string, input: HolidayInput) {
  const name = input.name.trim();
  if (!name) throw new HolidayError("Give the holiday a name");
  if (!isDate(input.startsOn) || !isDate(input.endsOn)) throw new HolidayError("Both dates are required");
  if (input.endsOn < input.startsOn) throw new HolidayError("The end is before the start");
  return db.holiday.create({ data: { organizationId, name, startsOn: dateOnlyFromStr(input.startsOn), endsOn: dateOnlyFromStr(input.endsOn) } });
}

export async function removeHoliday(db: PrismaClient, organizationId: string, holidayId: string) {
  const h = await db.holiday.findFirst({ where: { id: holidayId, organizationId } });
  if (!h) throw new HolidayError("Holiday not found");
  await db.holiday.delete({ where: { id: holidayId } });
}

export async function listHolidays(db: PrismaClient, organizationId: string) {
  return db.holiday.findMany({ where: { organizationId }, orderBy: { startsOn: "asc" } });
}

/** The ranges the recurrence code skips. */
export async function holidayRanges(db: PrismaClient, organizationId: string): Promise<DateRange[]> {
  const rows = await db.holiday.findMany({ where: { organizationId }, select: { startsOn: true, endsOn: true } });
  return rows.map((h) => ({ from: dateOnlyStr(h.startsOn), to: dateOnlyStr(h.endsOn) }));
}
