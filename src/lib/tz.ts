/**
 * Small timezone helpers with no dependency. Lesson times are stored as
 * instants; the organization has an IANA timezone; forms speak local
 * wall-clock time.
 */

function partsIn(date: Date, timeZone: string): Record<string, number> {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/** Offset of a zone at an instant, in minutes east of UTC. */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Wall-clock "YYYY-MM-DD" + "HH:MM" in a zone, as an instant. */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60000);
  // One correction pass handles the hour around a DST switch.
  const second = new Date(guess - offsetMinutes(first, timeZone) * 60000);
  return second;
}

/** "YYYY-MM-DD" of an instant as seen in a zone. */
export function localDateStr(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "HH:MM" of an instant as seen in a zone. */
export function localTimeStr(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** UTC midnight for the local calendar date of an instant. For @db.Date columns. */
export function localDateOnly(date: Date, timeZone: string): Date {
  const p = partsIn(date, timeZone);
  const out = new Date(0);
  out.setUTCFullYear(p.year, p.month - 1, p.day);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/** "YYYY-MM-DD" from a @db.Date value (which Prisma returns as UTC midnight). */
export function dateOnlyStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** @db.Date value from "YYYY-MM-DD". */
export function dateOnlyFromStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  const out = new Date(0);
  out.setUTCFullYear(y, m - 1, d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
