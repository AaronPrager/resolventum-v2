import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatTime } from "@/src/lib/format";
import { localDateStr, zonedToUtc } from "@/src/lib/tz";
import { calendarLessons, type CalendarLesson } from "@/src/services/calendar";
import { LinkButton, PageHeader } from "@/src/components/ui";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(dateStr, -dow);
}
function fmtDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function fmtMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function total(lessons: CalendarLesson[]): number {
  return lessons.reduce((s, l) => s + l.students.reduce((x, st) => x + st.priceCents, 0), 0);
}
/** "2:45PM", "4PM": short enough for a month cell. */
function shortTime(date: Date, tz: string): string {
  return formatTime(date, tz).replace(":00", "").replace(" ", "");
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; month?: string; view?: string }> }) {
  const q = await searchParams;
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const tz = org.timezone;
  const today = localDateStr(new Date(), tz);
  const view = q.view === "month" || (q.month && !q.week) ? "month" : "week";

  if (view === "month") {
    const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
    const first = `${month}-01`;
    const nextMonth = `${addMonths(month, 1)}-01`;
    // Six rows cover any month; the last row goes when it is entirely next month.
    let days = Array.from({ length: 42 }, (_, i) => addDays(mondayOf(first), i));
    if (days[35] >= nextMonth) days = days.slice(0, 35);
    const from = zonedToUtc(days[0], "00:00", tz);
    const to = zonedToUtc(addDays(days[days.length - 1], 1), "00:00", tz);
    const lessons = await calendarLessons(prisma, org.id, from, to, tz);
    const inMonth = lessons.filter((l) => l.day >= first && l.day < nextMonth && l.status !== "CANCELLED");
    const byDay = new Map<string, CalendarLesson[]>();
    for (const l of lessons) byDay.set(l.day, [...(byDay.get(l.day) ?? []), l]);
    const returnTo = `/calendar?month=${month}`;

    return (
      <div className="space-y-5">
        <PageHeader
          title={fmtMonth(month)}
          subtitle={`${inMonth.length} lessons, ${formatCents(total(inMonth))}`}
          actions={
            <>
              <ViewSwitch view="month" week={mondayOf(today)} month={month} />
              <LinkButton href={`/calendar?month=${addMonths(month, -1)}`} variant="secondary" aria-label="Previous month">Previous</LinkButton>
              <LinkButton href="/calendar?view=month" variant="secondary">Today</LinkButton>
              <LinkButton href={`/calendar?month=${addMonths(month, 1)}`} variant="secondary" aria-label="Next month">Next</LinkButton>
              <LinkButton href={`/lessons/new?date=${today}&returnTo=${encodeURIComponent(returnTo)}`} variant="primary">New lesson</LinkButton>
            </>
          }
        />

        <div className="overflow-x-auto">
          <div className="min-w-[640px]" data-testid="month">
            <div className="grid grid-cols-7 text-xs font-medium uppercase tracking-wide text-muted">
              {DAY_NAMES.map((n) => <div key={n} className="px-2 py-1">{n}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {days.map((d) => {
                const items = byDay.get(d) ?? [];
                const isToday = d === today;
                const outside = d < first || d >= nextMonth;
                return (
                  <section key={d} className={`min-h-28 p-1.5 ${outside ? "bg-surface-2" : "bg-surface"}`} data-day={d}>
                    <header className="mb-1 flex items-center justify-between">
                      <Link
                        href={`/calendar?week=${mondayOf(d)}`}
                        className={`rounded px-1 text-xs tabular-nums hover:bg-brand-soft hover:text-brand ${isToday ? "bg-brand font-semibold text-white hover:bg-brand hover:text-white" : outside ? "text-muted" : "text-fg"}`}
                        aria-label={`Week of ${fmtDay(mondayOf(d))}`}
                      >
                        {String(Number(d.slice(8)))}
                      </Link>
                      <Link href={`/lessons/new?date=${d}&returnTo=${encodeURIComponent(returnTo)}`} className="rounded px-1 text-xs text-muted opacity-60 hover:bg-brand-soft hover:text-brand hover:opacity-100" aria-label={`New lesson on ${d}`}>+</Link>
                    </header>
                    <ul className="space-y-0.5">
                      {items.map((l) => {
                        const cancelled = l.status === "CANCELLED";
                        const names = l.students.map((s) => s.name.split(" ")[0]).join(", ") || "No student";
                        const full = l.students.map((s) => s.name).join(", ") || "No student";
                        return (
                          <li key={l.id}>
                            <Link
                              href={`/lessons/${l.id}?returnTo=${encodeURIComponent(returnTo)}`}
                              title={`${formatTime(l.startsAt, tz)} ${full}${l.subject ? ` · ${l.subject}` : ""}${cancelled ? " (cancelled)" : ""}`}
                              className={`block truncate rounded border-l-2 px-1 py-0.5 text-[11px] leading-tight hover:bg-surface-3 ${cancelled ? "border-line text-muted line-through" : "bg-surface-2"}`}
                              style={cancelled ? undefined : { borderLeftColor: l.tutor?.color ?? "var(--brand)" }}
                            >
                              <span className="tabular-nums text-muted">{shortTime(l.startsAt, tz)}</span> {names}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const monday = mondayOf(q.week && /^\d{4}-\d{2}-\d{2}$/.test(q.week) ? q.week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = zonedToUtc(monday, "00:00", tz);
  const to = zonedToUtc(addDays(monday, 7), "00:00", tz);
  const lessons = await calendarLessons(prisma, org.id, from, to, tz);
  const byDay = new Map(days.map((d) => [d, lessons.filter((l) => l.day === d)]));
  const live = lessons.filter((l) => l.status !== "CANCELLED");
  const returnTo = `/calendar?week=${monday}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Week of ${fmtDay(monday)}`}
        subtitle={`${live.length} lessons, ${formatCents(total(live))}`}
        actions={
          <>
            <ViewSwitch view="week" week={monday} month={monday.slice(0, 7)} />
            <LinkButton href={`/calendar?week=${addDays(monday, -7)}`} variant="secondary" aria-label="Previous week">Previous</LinkButton>
            <LinkButton href="/calendar" variant="secondary">Today</LinkButton>
            <LinkButton href={`/calendar?week=${addDays(monday, 7)}`} variant="secondary" aria-label="Next week">Next</LinkButton>
            <LinkButton href={`/lessons/new?date=${today}&returnTo=${encodeURIComponent(returnTo)}`} variant="primary">New lesson</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-7" data-testid="week">
        {days.map((d, i) => {
          const items = byDay.get(d) ?? [];
          const isToday = d === today;
          return (
            <section key={d} className={`min-h-36 rounded-lg border bg-surface p-2 ${isToday ? "border-brand ring-1 ring-brand/30" : "border-line"}`} data-day={d}>
              <header className="mb-2 flex items-baseline justify-between text-sm">
                <span className={isToday ? "font-semibold text-brand" : "text-muted"}>{DAY_NAMES[i]} <span className="text-fg">{fmtDay(d)}</span></span>
                <Link href={`/lessons/new?date=${d}&returnTo=${encodeURIComponent(returnTo)}`} className="rounded px-1.5 text-muted hover:bg-brand-soft hover:text-brand" aria-label={`New lesson on ${d}`}>+</Link>
              </header>
              <ul className="space-y-1.5">
                {items.map((l) => {
                  const cancelled = l.status === "CANCELLED";
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/lessons/${l.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        className={`block rounded-md border-l-4 px-2 py-1.5 text-xs leading-snug hover:bg-surface-3 ${cancelled ? "border-line bg-surface-2 text-muted line-through" : "bg-surface-2"}`}
                        style={cancelled ? undefined : { borderLeftColor: l.tutor?.color ?? "var(--brand)" }}
                      >
                        <div className="flex items-baseline justify-between gap-1 font-semibold tabular-nums"><span>{formatTime(l.startsAt, tz)}</span><span className="font-normal text-muted">{l.durationMin} min</span></div>
                        <div className="font-medium">{l.students.map((s) => s.name).join(", ") || "No student"}</div>
                        <div className="text-muted">{l.subject}{l.locationType === "REMOTE" ? " · remote" : ""}{l.seriesId ? " · weekly" : ""}</div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ViewSwitch({ view, week, month }: { view: "week" | "month"; week: string; month: string }) {
  const base = "px-3 py-1.5 text-sm";
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
      <Link href={`/calendar?week=${week}`} aria-current={view === "week" ? "page" : undefined} className={`${base} ${view === "week" ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-3"}`}>Week</Link>
      <Link href={`/calendar?month=${month}`} aria-current={view === "month" ? "page" : undefined} className={`${base} border-l border-line ${view === "month" ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-3"}`}>Month</Link>
    </div>
  );
}
