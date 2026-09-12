import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents } from "@/src/lib/format";
import { localDateStr, localTimeStr, zonedToUtc } from "@/src/lib/tz";
import { calendarLessons } from "@/src/services/calendar";
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

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const q = await searchParams;
  const session = await requireSession();
  const org = { id: session.organizationId, name: session.organizationName, timezone: session.timezone };
  const tz = org.timezone;
  const today = localDateStr(new Date(), tz);
  const monday = mondayOf(q.week && /^\d{4}-\d{2}-\d{2}$/.test(q.week) ? q.week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = zonedToUtc(monday, "00:00", tz);
  const to = zonedToUtc(addDays(monday, 7), "00:00", tz);
  const lessons = await calendarLessons(prisma, org.id, from, to, tz);
  const byDay = new Map(days.map((d) => [d, lessons.filter((l) => l.day === d)]));
  const live = lessons.filter((l) => l.status !== "CANCELLED");
  const weekTotal = live.reduce((s, l) => s + l.students.reduce((x, st) => x + st.priceCents, 0), 0);
  const returnTo = `/calendar?week=${monday}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Week of ${fmtDay(monday)}`}
        subtitle={`${live.length} lessons, ${formatCents(weekTotal)}`}
        actions={
          <>
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
                        <div className="font-semibold tabular-nums">{localTimeStr(l.startsAt, tz)} <span className="font-normal text-muted">· {l.durationMin} min</span></div>
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
