import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatTime } from "@/src/lib/format";
import { localDateStr, zonedToUtc } from "@/src/lib/tz";
import { calendarLessons, type CalendarLesson } from "@/src/services/calendar";
import { Empty, LinkButton, PageHeader } from "@/src/components/ui";
import { DayCell } from "./DayCell";
import { TutorFilter } from "./TutorFilter";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type View = "day" | "week" | "month";

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
function fmtLongDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
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
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string; week?: string; month?: string; view?: string; tutor?: string }> }) {
  const q = await searchParams;
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const tz = org.timezone;
  const today = localDateStr(new Date(), tz);
  // Month is the default; day and week are shown only when asked for.
  const view: View = q.view === "day" || isDate(q.day) ? "day" : q.view === "week" || isDate(q.week) ? "week" : "month";
  const tutors = await prisma.tutor.findMany({ where: { organizationId: org.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
  const tutor = q.tutor === "none" || tutors.some((t) => t.id === q.tutor) ? q.tutor! : "";
  const tq = tutor ? `&tutor=${tutor}` : "";
  const tutorName = tutor === "none" ? "no tutor set" : tutors.find((t) => t.id === tutor)?.name;
  const keep = (lessons: CalendarLesson[]) => (tutor ? lessons.filter((l) => (tutor === "none" ? !l.tutor : l.tutor?.id === tutor)) : lessons);

  // Anchors for the view switch and the tutor filter, so switching never loses the place.
  const anchorDay = isDate(q.day) ? q.day! : isDate(q.week) ? q.week! : today;
  const anchorWeek = mondayOf(anchorDay);
  const anchorMonth = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : anchorDay.slice(0, 7);
  const viewHref = (v: View, t = tutor) => `/calendar?${v === "day" ? `day=${anchorDay}` : v === "week" ? `week=${anchorWeek}` : `month=${anchorMonth}`}${t ? `&tutor=${t}` : ""}`;
  const hrefFor: Record<string, string> = { "": viewHref(view, ""), none: viewHref(view, "none") };
  for (const t of tutors) hrefFor[t.id] = viewHref(view, t.id);
  const controls = (
    <>
      <ViewSwitch view={view} hrefs={{ day: viewHref("day"), week: viewHref("week"), month: viewHref("month") }} />
      {tutors.length > 0 && <TutorFilter tutors={tutors} value={tutor} hrefFor={hrefFor} />}
    </>
  );
  const subtitleFor = (n: number, cents: number) => `${n} lesson${n === 1 ? "" : "s"}, ${formatCents(cents)}${tutorName ? ` · ${tutorName}` : ""}`;

  if (view === "day") {
    const day = anchorDay;
    const from = zonedToUtc(day, "00:00", tz);
    const to = zonedToUtc(addDays(day, 1), "00:00", tz);
    const lessons = keep(await calendarLessons(prisma, org.id, from, to, tz)).filter((l) => l.day === day);
    const live = lessons.filter((l) => l.status !== "CANCELLED");
    const returnTo = `/calendar?day=${day}${tq}`;
    // With no tutor chosen, the day is grouped by tutor so each person's list reads on its own.
    const groups: { key: string; name: string; color: string | null; items: CalendarLesson[] }[] = [];
    for (const l of lessons) {
      const key = l.tutor?.id ?? "none";
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, name: l.tutor?.name ?? "No tutor set", color: l.tutor?.color ?? null, items: [] }));
      g.items.push(l);
    }
    const grouped = !tutor && groups.length > 1;

    return (
      <div className="space-y-5">
        <PageHeader
          title={day === today ? `Today, ${fmtLongDay(day)}` : fmtLongDay(day)}
          subtitle={subtitleFor(live.length, total(live))}
          actions={
            <>
              {controls}
              <LinkButton href={`/calendar?day=${addDays(day, -1)}${tq}`} variant="secondary" aria-label="Previous day">Previous</LinkButton>
              <LinkButton href={`/calendar?day=${today}${tq}`} variant="secondary">Today</LinkButton>
              <LinkButton href={`/calendar?day=${addDays(day, 1)}${tq}`} variant="secondary" aria-label="Next day">Next</LinkButton>
              <LinkButton href={`/lessons/new?date=${day}&returnTo=${encodeURIComponent(returnTo)}`} variant="primary">New lesson</LinkButton>
            </>
          }
        />
        {lessons.length === 0 ? <Empty>Nothing on this day.</Empty> : (
          <div className="space-y-4" data-testid="day">
            {(grouped ? groups : [{ key: "all", name: "", color: null, items: lessons }]).map((g) => (
              <section key={g.key} className="rounded-lg border border-line bg-surface">
                {grouped && (
                  <header className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm font-semibold">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: g.color ?? "var(--brand)" }} aria-hidden />
                    {g.name}
                    <span className="font-normal text-muted">· {g.items.filter((l) => l.status !== "CANCELLED").length === 1 ? "1 lesson" : `${g.items.filter((l) => l.status !== "CANCELLED").length} lessons`}</span>
                  </header>
                )}
                <ol className="divide-y divide-line">
                  {g.items.map((l) => {
                    const cancelled = l.status === "CANCELLED";
                    return (
                      <li key={l.id}>
                        <Link
                          href={`/lessons/${l.id}?returnTo=${encodeURIComponent(returnTo)}`}
                          className={`flex items-start gap-4 border-l-4 px-4 py-3 hover:bg-surface-2 ${cancelled ? "text-muted line-through" : ""}`}
                          style={cancelled ? { borderLeftColor: "var(--line)" } : { borderLeftColor: l.tutor?.color ?? "var(--brand)" }}
                        >
                          <div className="w-28 shrink-0 tabular-nums">
                            <div className="font-semibold">{l.allDay ? "All day" : formatTime(l.startsAt, tz)}</div>
                            {!l.allDay && <div className="text-xs text-muted">to {formatTime(l.endsAt, tz)} · {l.durationMin} min</div>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{l.students.map((s) => s.name).join(", ") || l.subject}</div>
                            <div className="text-sm text-muted">
                              {[l.subject, l.locationType === "REMOTE" ? "remote" : "in person", l.seriesId ? "weekly" : null, !grouped && l.tutor ? l.tutor.name : null].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm tabular-nums text-muted">{formatCents(l.students.reduce((s, st) => s + st.priceCents, 0))}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "month") {
    const month = anchorMonth;
    const first = `${month}-01`;
    const nextMonth = `${addMonths(month, 1)}-01`;
    // Six rows cover any month; the last row goes when it is entirely next month.
    let days = Array.from({ length: 42 }, (_, i) => addDays(mondayOf(first), i));
    if (days[35] >= nextMonth) days = days.slice(0, 35);
    const from = zonedToUtc(days[0], "00:00", tz);
    const to = zonedToUtc(addDays(days[days.length - 1], 1), "00:00", tz);
    const lessons = keep(await calendarLessons(prisma, org.id, from, to, tz));
    const inMonth = lessons.filter((l) => l.day >= first && l.day < nextMonth && l.status !== "CANCELLED");
    const byDay = new Map<string, CalendarLesson[]>();
    for (const l of lessons) byDay.set(l.day, [...(byDay.get(l.day) ?? []), l]);
    const returnTo = `/calendar?month=${month}${tq}`;

    return (
      <div className="space-y-5">
        <PageHeader
          title={fmtMonth(month)}
          subtitle={subtitleFor(inMonth.length, total(inMonth))}
          actions={
            <>
              {controls}
              <LinkButton href={`/calendar?month=${addMonths(month, -1)}${tq}`} variant="secondary" aria-label="Previous month">Previous</LinkButton>
              <LinkButton href={`/calendar${tutor ? `?tutor=${tutor}` : ""}`} variant="secondary">Today</LinkButton>
              <LinkButton href={`/calendar?month=${addMonths(month, 1)}${tq}`} variant="secondary" aria-label="Next month">Next</LinkButton>
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
                  <DayCell key={d} day={d} newHref={`/lessons/new?date=${d}&returnTo=${encodeURIComponent(returnTo)}`} className={`min-h-28 p-1.5 ${outside ? "bg-surface-2" : "bg-surface"}`}>
                    <header className="mb-1 flex items-center justify-between">
                      <Link
                        href={`/calendar?day=${d}${tq}`}
                        className={`rounded px-1 text-xs tabular-nums hover:bg-brand-soft hover:text-brand ${isToday ? "bg-brand font-semibold text-white hover:bg-brand hover:text-white" : outside ? "text-muted" : "text-fg"}`}
                        aria-label={`Day view for ${fmtDay(d)}`}
                      >
                        {String(Number(d.slice(8)))}
                      </Link>
                      <Link href={`/lessons/new?date=${d}&returnTo=${encodeURIComponent(returnTo)}`} className="rounded px-1 text-xs text-muted opacity-60 hover:bg-brand-soft hover:text-brand hover:opacity-100" aria-label={`New lesson on ${d}`}>+</Link>
                    </header>
                    <ul className="space-y-0.5">
                      {items.map((l) => {
                        const cancelled = l.status === "CANCELLED";
                        const names = l.students.map((s) => s.name.split(" ")[0]).join(", ") || l.subject || "Event";
                        const full = l.students.map((s) => s.name).join(", ") || l.subject || "Event";
                        return (
                          <li key={l.id}>
                            <Link
                              href={`/lessons/${l.id}?returnTo=${encodeURIComponent(returnTo)}`}
                              title={`${l.allDay ? "All day" : formatTime(l.startsAt, tz)} ${full}${l.subject ? ` · ${l.subject}` : ""}${l.tutor ? ` · ${l.tutor.name}` : ""}${cancelled ? " (cancelled)" : ""}`}
                              className={`block truncate rounded border-l-2 px-1 py-0.5 text-[11px] leading-tight hover:bg-surface-3 ${cancelled ? "border-line text-muted line-through" : "bg-surface-2"}`}
                              style={cancelled ? undefined : { borderLeftColor: l.tutor?.color ?? "var(--brand)" }}
                            >
                              <span className="tabular-nums text-muted">{l.allDay ? "" : shortTime(l.startsAt, tz)}</span> {names}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </DayCell>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const monday = anchorWeek;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = zonedToUtc(monday, "00:00", tz);
  const to = zonedToUtc(addDays(monday, 7), "00:00", tz);
  const lessons = keep(await calendarLessons(prisma, org.id, from, to, tz));
  const byDay = new Map(days.map((d) => [d, lessons.filter((l) => l.day === d)]));
  const live = lessons.filter((l) => l.status !== "CANCELLED");
  const returnTo = `/calendar?week=${monday}${tq}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Week of ${fmtDay(monday)}`}
        subtitle={subtitleFor(live.length, total(live))}
        actions={
          <>
            {controls}
            <LinkButton href={`/calendar?week=${addDays(monday, -7)}${tq}`} variant="secondary" aria-label="Previous week">Previous</LinkButton>
            <LinkButton href={`/calendar?week=${today}${tq}`} variant="secondary">Today</LinkButton>
            <LinkButton href={`/calendar?week=${addDays(monday, 7)}${tq}`} variant="secondary" aria-label="Next week">Next</LinkButton>
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
                <Link href={`/calendar?day=${d}${tq}`} className={`rounded px-1 hover:bg-brand-soft hover:text-brand ${isToday ? "font-semibold text-brand" : "text-muted"}`} aria-label={`Day view for ${fmtDay(d)}`}>
                  {DAY_NAMES[i]} <span className="text-fg">{fmtDay(d)}</span>
                </Link>
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
                        <div className="flex items-baseline justify-between gap-1 font-semibold tabular-nums"><span>{l.allDay ? "All day" : formatTime(l.startsAt, tz)}</span>{!l.allDay && <span className="font-normal text-muted">{l.durationMin} min</span>}</div>
                        <div className="font-medium">{l.students.map((s) => s.name).join(", ") || l.subject}</div>
                        <div className="text-muted">{[l.subject, l.locationType === "REMOTE" ? "remote" : null, l.seriesId ? "weekly" : null, !tutor && l.tutor ? l.tutor.name : null].filter(Boolean).join(" · ")}</div>
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

function ViewSwitch({ view, hrefs }: { view: View; hrefs: Record<View, string> }) {
  const base = "px-3 py-1.5 text-sm";
  const views: [View, string][] = [["day", "Day"], ["week", "Week"], ["month", "Month"]];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
      {views.map(([v, label], i) => (
        <Link key={v} href={hrefs[v]} aria-current={view === v ? "page" : undefined} className={`${base} ${i > 0 ? "border-l border-line" : ""} ${view === v ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-3"}`}>{label}</Link>
      ))}
    </div>
  );
}
