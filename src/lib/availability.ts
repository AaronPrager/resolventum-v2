/**
 * A tutor's weekly hours as short text: "Mon-Thu 16:00-20:00, Sat 9:00-13:00".
 * Days are Mon..Sun (a range with a dash, or one day), times are 24-hour
 * HH:MM or H:MM. Windows are separated by commas or semicolons. The text is
 * kept as typed; this parses it for the lesson form's warning and refuses
 * anything it cannot read, so a typo never silently means "always free".
 */
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof DAYS)[number];

export interface Window {
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  /** Minutes from midnight. */
  from: number;
  to: number;
}

export class AvailabilityError extends Error {}

const DAY_INDEX: Record<string, number> = { mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6 };

function minutes(t: string): number {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim());
  if (!m) throw new AvailabilityError(`"${t}" is not a time. Use 24-hour times like 16:00, or 4pm.`);
  let h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) throw new AvailabilityError(`"${t}" is not a time.`);
  return h * 60 + mm;
}

function dayIndex(s: string): number {
  const d = DAY_INDEX[s.trim().toLowerCase()];
  if (d === undefined) throw new AvailabilityError(`"${s}" is not a day. Use Mon, Tue, Wed, Thu, Fri, Sat, Sun.`);
  return d;
}

/** Parse the text. Empty text means no hours given (null); bad text throws. */
export function parseAvailability(text: string | null | undefined): Window[] | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const out: Window[] = [];
  for (const part of t.split(/[,;]+/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^([A-Za-z]+)(?:\s*[-–]\s*([A-Za-z]+))?\s+(.+?)\s*[-–]\s*(.+)$/.exec(part);
    if (!m) throw new AvailabilityError(`"${part}" does not read as day and hours. Write it like "Mon-Thu 16:00-20:00".`);
    const first = dayIndex(m[1]);
    const last = m[2] ? dayIndex(m[2]) : first;
    const from = minutes(m[3]);
    const to = minutes(m[4]);
    if (to <= from) throw new AvailabilityError(`"${part}": the end is not after the start.`);
    for (let d = first; ; d = (d + 1) % 7) {
      out.push({ day: d, from, to });
      if (d === last) break;
    }
  }
  return out;
}

/** True when the whole lesson sits inside one window. No hours given = nothing to check = true. */
export function withinAvailability(windows: Window[] | null, day: number, startMin: number, durationMin: number): boolean {
  if (!windows) return true;
  return windows.some((w) => w.day === day && startMin >= w.from && startMin + durationMin <= w.to);
}

/** Day of week (0 = Monday) of a "YYYY-MM-DD". */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "Mon-Thu 4:00-8:00 PM, Sat 9:00 AM-1:00 PM", for the warning and the profile. */
export function describeAvailability(windows: Window[]): string {
  const fmt = (min: number) => {
    const h = Math.floor(min / 60), mm = min % 60;
    const ap = h >= 12 && h < 24 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${ap}`;
  };
  // Group consecutive days with the same hours back into ranges.
  const groups: { first: number; last: number; from: number; to: number }[] = [];
  for (const w of [...windows].sort((a, b) => a.day - b.day || a.from - b.from)) {
    const g = groups[groups.length - 1];
    if (g && g.from === w.from && g.to === w.to && g.last === w.day - 1) g.last = w.day;
    else groups.push({ first: w.day, last: w.day, from: w.from, to: w.to });
  }
  return groups.map((g) => `${DAYS[g.first]}${g.last !== g.first ? `-${DAYS[g.last]}` : ""} ${fmt(g.from)} to ${fmt(g.to)}`).join(", ");
}

/** What a lesson would cost at the tutor's client rate, or null without one. */
export function suggestedPriceCents(clientRateCents: number | null | undefined, durationMin: number): number | null {
  if (clientRateCents == null || !Number.isFinite(durationMin) || durationMin <= 0) return null;
  return Math.round((clientRateCents * durationMin) / 60);
}
