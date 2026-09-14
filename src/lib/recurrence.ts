/**
 * Weekly recurrence with local wall-clock times. A series that starts at
 * 4:00 pm New York stays at 4:00 pm across the DST switch, so occurrences
 * are generated from local date and time, not by adding 7 x 24 hours.
 *
 * Only FREQ=WEEKLY with an optional INTERVAL is supported, which is what v1
 * had. The rule string is RFC 5545 so other frequencies can be added later.
 */
import { dateOnlyStr, localDateStr, localTimeStr, zonedToUtc } from "./tz";

export interface WeeklyRule {
  intervalWeeks: number;
}

export function parseRule(rrule: string): WeeklyRule {
  const parts = Object.fromEntries(rrule.split(";").map((p) => p.split("=") as [string, string]));
  if (parts.FREQ !== "WEEKLY") throw new Error(`Unsupported recurrence rule: ${rrule}`);
  const intervalWeeks = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 52) throw new Error(`Bad INTERVAL in ${rrule}`);
  return { intervalWeeks };
}

export function formatRule(rule: WeeklyRule): string {
  return rule.intervalWeeks === 1 ? "FREQ=WEEKLY" : `FREQ=WEEKLY;INTERVAL=${rule.intervalWeeks}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** A closed date range, "YYYY-MM-DD" both ends, that a term-time series skips. */
export interface DateRange {
  from: string;
  to: string;
}

export function inRanges(dateStr: string, ranges: DateRange[] | undefined): boolean {
  return !!ranges?.some((r) => dateStr >= r.from && dateStr <= r.to);
}

/**
 * Occurrence instants for a series, from its first lesson up to and including
 * `until` (a calendar date, "YYYY-MM-DD" in the zone), or `count` occurrences,
 * whichever comes first. Includes the first occurrence. Dates inside `skip`
 * (school holidays) are left out and do not count toward `count`; the loop
 * still stops after ten years of weeks so a bad range cannot spin forever.
 */
export function weeklyOccurrences(opts: {
  firstStartsAt: Date;
  timeZone: string;
  intervalWeeks: number;
  until?: string | null;
  count?: number | null;
  skip?: DateRange[];
}): Date[] {
  const { firstStartsAt, timeZone, intervalWeeks } = opts;
  const max = opts.count ?? 520; // hard stop at ten years of weekly lessons
  const untilStr = opts.until ?? null;
  const time = localTimeStr(firstStartsAt, timeZone);
  let date = localDateStr(firstStartsAt, timeZone);
  const out: Date[] = [];
  for (let step = 0; out.length < max && step < 520; step++) {
    if (untilStr && date > untilStr) break;
    if (!inRanges(date, opts.skip)) out.push(zonedToUtc(date, time, timeZone));
    date = addDays(date, 7 * intervalWeeks);
  }
  return out;
}

/** Same as weeklyOccurrences but starting after a given instant, for extending an existing series. */
export function weeklyOccurrencesAfter(opts: {
  firstStartsAt: Date;
  timeZone: string;
  intervalWeeks: number;
  after: Date;
  until: string;
  skip?: DateRange[];
}): Date[] {
  return weeklyOccurrences({ ...opts, count: null }).filter((d) => d > opts.after);
}

export { dateOnlyStr };
