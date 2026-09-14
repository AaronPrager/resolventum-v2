import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarDays, NotebookPen, UserPlus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatWhen } from "@/src/lib/format";
import { ownerDashboard } from "@/src/services/dashboard";
import { Balance, Card, Empty, LinkButton, PageHeader, Stat } from "@/src/components/ui";

export const dynamic = "force-dynamic";

/** The owner's home: the week, the month's money, and what needs a hand. Tutors start on the calendar. */
export default async function Home() {
  const s = await requireSession();
  if (s.role === "TUTOR") redirect("/calendar");
  const d = await ownerDashboard(prisma, s.organizationId, s.timezone);
  const m = d.monthly;
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${m.month}-01T00:00:00Z`));
  return (
    <div className="space-y-6">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}`} subtitle={`${s.organizationName} · ${d.students.active} active students${d.students.paused ? `, ${d.students.paused} paused` : ""} · ${d.leads.open} open lead${d.leads.open === 1 ? "" : "s"}`}
        actions={<><LinkButton href="/calendar" variant="secondary"><CalendarDays aria-hidden />Calendar</LinkButton><LinkButton href="/leads" variant="secondary"><UserPlus aria-hidden />Leads</LinkButton></>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dashboard-week">
        <Stat label={`Lessons this week`} value={d.week.lessons} tone="muted" />
        <Stat label="Hours" value={d.week.hours} tone="muted" />
        <Stat label="Still to teach" value={d.week.left} tone="muted" />
        <Stat label="Cancelled or missed" value={d.week.cancelled + d.week.noShows} tone={d.week.cancelled + d.week.noShows ? "owed" : "muted"} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dashboard-month">
        <Stat label={`Collected in ${monthLabel}`} value={formatCents(m.collectedCents)} tone="credit" />
        <Stat label="Owed to you" value={formatCents(d.money.owedCents)} tone={d.money.owedCents ? "owed" : "muted"} />
        <Stat label="Unearned (credit held)" value={formatCents(d.money.creditHeldCents)} tone="muted" />
        <Stat label={`Margin, ${monthLabel}`} value={m.unpricedLessons ? "set pay rates" : formatCents(m.marginCents)} tone={m.marginCents >= 0 ? "credit" : "owed"} />
      </div>
      <p className="-mt-3 text-xs text-muted">Margin is lessons charged this month ({formatCents(m.lessonsChargedCents)}) less tutor pay ({formatCents(m.tutorPayCents)}). Unearned is money families paid ahead that lessons have not used yet.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="inline-flex items-center gap-2"><NotebookPen className="size-4 text-brand" aria-hidden />Notes still to write ({d.notesMissing})</span>}>
          {d.notesMissingLessons.length === 0 ? <Empty>Every lesson from the last week has its note.</Empty> : (
            <ul className="divide-y divide-line text-sm" data-testid="notes-missing">
              {d.notesMissingLessons.map((l) => (
                <li key={l.lessonId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="w-44 shrink-0 tabular-nums text-muted">{formatWhen(l.startsAt, s.timezone)}</span>
                  <span className="min-w-0 flex-1">{l.students.map((x) => x.name).join(", ")} · {l.subject}{l.tutor && <span className="text-muted"> · {l.tutor}</span>}</span>
                  <Link href={`/lessons/${l.lessonId}?returnTo=%2F#notes`} className="text-brand hover:underline">Write it</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">What was covered, one win, one struggle, the next goal. The family gets it the same day.</p>
        </Card>
        <Card title={<span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 text-warn" aria-hidden />Families to check on ({d.atRisk.length})</span>}>
          {d.atRisk.length === 0 ? <Empty>Nobody is slipping.</Empty> : (
            <ul className="divide-y divide-line text-sm" data-testid="at-risk">
              {d.atRisk.map((a) => (
                <li key={a.accountId} className="flex items-center gap-3 py-2">
                  <Link href={`/accounts/${a.accountId}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{a.name}</Link>
                  <span className="text-muted">{a.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Two or more cancelled or missed lessons in the last 30 days, or a balance over the threshold in Settings.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="This week">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Taught so far</dt><dd className="tabular-nums">{d.week.done}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Charged for the week</dt><dd className="tabular-nums">{formatCents(d.week.chargedCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">No-shows</dt><dd className="tabular-nums">{d.week.noShows}</dd></div>
          </dl>
        </Card>
        <Card title={monthLabel}>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Lessons charged</dt><dd className="tabular-nums">{m.lessonsCharged}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Refunded</dt><dd className="tabular-nums">{formatCents(m.refundedCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Families owing</dt><dd className="tabular-nums">{d.money.owingFamilies}</dd></div>
          </dl>
          <p className="mt-2 text-xs"><Link href="/reports/payroll" className="text-brand hover:underline">Pay run</Link> · <Link href="/reports" className="text-brand hover:underline">Reports</Link></p>
        </Card>
        <Card title="Pipeline">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">New inquiries</dt><dd className="tabular-nums">{d.leads.inquiries}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Open leads</dt><dd className="tabular-nums">{d.leads.open}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Graduated</dt><dd className="tabular-nums">{d.students.graduated}</dd></div>
          </dl>
          <p className="mt-2 text-xs"><Link href="/leads" className="text-brand hover:underline">Work the pipeline</Link></p>
        </Card>
      </div>
      <p className="text-xs text-muted">Balance colours: <Balance cents={1} /> means the family owes, <Balance cents={-1} /> means they paid ahead.</p>
    </div>
  );
}
