import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarDays, Moon, NotebookPen, UserPlus } from "lucide-react";
import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { registrationOpen } from "@/src/auth/registration";
import { formatCents, formatTime } from "@/src/lib/format";
import { ownerDashboard } from "@/src/services/dashboard";
import { Card, Empty, LinkButton, PageHeader, Stat } from "@/src/components/ui";
import { Landing } from "./Landing";
import { MoneyChart } from "./MoneyChart";

export const dynamic = "force-dynamic";

/**
 * Signed out: the front page. Signed in: the owner's home, built to answer
 * three questions at a glance: what is happening today, how the money is
 * going, and what needs a hand. Tutors start on the calendar.
 */
export default async function Home() {
  const s = await currentSession();
  if (!s) return <Landing signupOpen={registrationOpen()} />;
  if (s.role === "TUTOR") redirect("/calendar");
  const d = await ownerDashboard(prisma, s.organizationId, s.timezone);
  const m = d.monthly;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: s.timezone }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLine = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: s.timezone }).format(now);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${m.month}-01T00:00:00Z`));
  const lastMonth = d.months[d.months.length - 2];
  const today = d.todayLessons.filter((l) => l.status !== "CANCELLED");
  const nextUp = today.find((l) => l.endsAt > now);

  const attention = [
    { n: d.notesMissing, icon: NotebookPen, label: "session notes to write", hint: "Lessons from the last week without a note for the family.", href: "/notes", tone: "brand" as const },
    { n: d.atRisk.length, icon: AlertTriangle, label: "families to check on", hint: d.atRisk.slice(0, 3).map((a) => a.name).join(", ") + (d.atRisk.length > 3 ? ` and ${d.atRisk.length - 3} more` : ""), href: "/accounts", tone: "warn" as const },
    { n: d.dormant.length, icon: Moon, label: "students with nothing going on", hint: "No lesson in 60 days and nothing booked. Pause, graduate, or archive them.", href: "/students?quiet=1", tone: "muted" as const },
    { n: d.leads.open, icon: UserPlus, label: "open leads", hint: `${d.leads.inquiries} new inquir${d.leads.inquiries === 1 ? "y" : "ies"} waiting for a first call.`, href: "/leads", tone: "brand" as const },
  ].filter((a) => a.n > 0);

  return (
    <div className="space-y-6">
      <PageHeader title={greeting} subtitle={`${dateLine} · ${s.organizationName}`} actions={<LinkButton href="/calendar" variant="secondary"><CalendarDays aria-hidden />Calendar</LinkButton>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dashboard-stats">
        <Stat wash label="This week" value={d.week.lessons} tone="muted" note={`lesson${d.week.lessons === 1 ? "" : "s"}, ${d.week.hours} hours${d.week.left ? `, ${d.week.left} still to teach` : ""}`} />
        <Stat wash label={`Collected, ${monthLabel}`} value={formatCents(m.collectedCents)} tone="credit" note={lastMonth ? `${formatCents(lastMonth.collectedCents).replace(/\.00$/, "")} in ${lastMonth.label}` : undefined} />
        <Stat wash label="Owed to you" value={formatCents(d.money.owedCents)} tone={d.money.owedCents ? "owed" : "muted"} note={`${d.money.owingFamilies} famil${d.money.owingFamilies === 1 ? "y" : "ies"}, ${formatCents(d.money.creditHeldCents).replace(/\.00$/, "")} held as credit`} />
        <Stat wash label={`Margin, ${monthLabel}`} value={m.unpricedLessons ? "set pay rates" : formatCents(m.marginCents)} tone={m.marginCents >= 0 ? "credit" : "owed"} note={m.unpricedLessons ? `${m.unpricedLessons} lesson${m.unpricedLessons === 1 ? "" : "s"} without a pay rule` : `${formatCents(m.lessonsChargedCents).replace(/\.00$/, "")} charged, ${formatCents(m.tutorPayCents).replace(/\.00$/, "")} tutor pay`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="Today" description={today.length === 0 ? "Nothing on the calendar." : `${today.length} lesson${today.length === 1 ? "" : "s"}${nextUp ? `, next at ${formatTime(nextUp.startsAt, s.timezone)}` : ", all done"}`} actions={<Link href={`/calendar?day=${d.today}`} className="text-xs text-brand hover:underline">Day view</Link>}>
          {today.length === 0 ? <Empty>A clear day.</Empty> : (
            <ol className="divide-y divide-line text-sm" data-testid="today">
              {today.slice(0, 8).map((l) => {
                const past = l.endsAt <= now;
                const live = l.startsAt <= now && l.endsAt > now;
                return (
                  <li key={l.id} className={`flex items-center gap-3 py-2 ${past ? "text-muted" : ""}`}>
                    <span className={`w-16 shrink-0 tabular-nums ${live ? "font-semibold text-brand" : ""}`}>{l.allDay ? "All day" : formatTime(l.startsAt, s.timezone)}</span>
                    <span className="min-w-0 flex-1 truncate"><Link href={`/lessons/${l.id}?returnTo=%2F`} className="underline-offset-2 hover:text-brand hover:underline">{l.students.map((x) => x.name).join(", ") || l.subject || "Event"}</Link>{[l.students.length ? l.subject : "", l.tutor?.name].filter(Boolean).length > 0 && <span className="text-muted"> · {[l.students.length ? l.subject : "", l.tutor?.name].filter(Boolean).join(" · ")}</span>}</span>
                    {l.tutor?.color && <span className="size-2 shrink-0 rounded-full" style={{ background: l.tutor.color }} aria-hidden />}
                  </li>
                );
              })}
              {today.length > 8 && <li className="py-2 text-xs text-muted">and {today.length - 8} more on the <Link href={`/calendar?day=${d.today}`} className="text-brand hover:underline">calendar</Link></li>}
            </ol>
          )}
        </Card>
        <Card title="Money collected" description="Payments received per month, the last six months. The current month is still filling up.">
          <MoneyChart months={d.months} />
        </Card>
      </div>

      <Card title="Needs attention" description={attention.length === 0 ? "Nothing waiting on you." : undefined}>
        {attention.length === 0 ? <Empty>All caught up.</Empty> : (
          <ul className="divide-y divide-line" data-testid="attention">
            {attention.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.label}>
                  <Link href={a.href} className="group flex items-center gap-3 py-2.5 text-sm">
                    <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${a.tone === "warn" ? "bg-warn-soft text-warn" : a.tone === "brand" ? "bg-brand-soft text-brand" : "bg-surface-3 text-muted"}`}><Icon className="size-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium"><span className="tabular-nums">{a.n}</span> {a.label}</span>
                      {a.hint && <span className="block truncate text-xs text-muted">{a.hint}</span>}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
