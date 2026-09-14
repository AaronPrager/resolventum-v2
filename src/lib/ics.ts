/**
 * Minimal iCalendar writer (RFC 5545). Times are written in UTC so no
 * VTIMEZONE block is needed; Apple and Google convert on display.
 */

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  cancelled?: boolean;
  /** Whole days: start and end are midnights, end exclusive, and only the dates go out. */
  allDay?: boolean;
  /** Last change, for SEQUENCE and LAST-MODIFIED. */
  updatedAt?: Date;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** Fold at 75 octets, continuation lines start with a space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const max = first ? 75 : 74;
    let end = Math.min(i + max, bytes.length);
    while (end < bytes.length && end > i && (bytes[end] & 0xc0) === 0x80) end--; // do not split a UTF-8 character
    out.push((first ? "" : " ") + bytes.subarray(i, end).toString("utf8"));
    i = end;
    first = false;
  }
  return out.join("\r\n");
}

export function buildIcs(opts: { name: string; events: IcsEvent[]; now?: Date; prodId?: string }): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${opts.prodId ?? "-//Resolventum//Lessons//EN"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(opts.name)}`,
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of opts.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${icsDate(now)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start).slice(0, 8)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(e.end).slice(0, 8)}`);
    } else {
      lines.push(`DTSTART:${icsDate(e.start)}`);
      lines.push(`DTEND:${icsDate(e.end)}`);
    }
    lines.push(`SUMMARY:${icsText(e.cancelled ? `Cancelled: ${e.summary}` : e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`);
    if (e.updatedAt) {
      lines.push(`LAST-MODIFIED:${icsDate(e.updatedAt)}`);
      lines.push(`SEQUENCE:${Math.floor(e.updatedAt.getTime() / 1000) % 2147483647}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
