/**
 * The owner's home page: this week's lessons, this month's money, what is
 * still owed and what is held as credit, the month's margin after tutor pay,
 * families who look like they are slipping, and the notes still to write.
 * Everything is derived; nothing here is stored.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { localDateStr, zonedToUtc } from "../lib/tz";
import { accountBalances } from "./balances";
import { payRun } from "./payroll";
import { lessonsMissingNotes } from "./sessionNotes";
import { leadCounts } from "./leads";
import { archiveCandidates } from "./students";
import { calendarLessons } from "./calendar";

export interface MonthMoney { month: string; label: string; collectedCents: number; refundedCents: number; lessons: number; current: boolean }

/** Money collected per month for the last `months` calendar months, oldest first, with lessons taught. */
export async function moneyByMonth(db: PrismaClient, organizationId: string, timeZone: string, now = new Date(), months = 6): Promise<MonthMoney[]> {
  const today = localDateStr(now, timeZone);
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - months, 1));
  const [paid, taught] = await Promise.all([
    db.$queryRaw<{ m: string; paid: bigint; refunded: bigint }[]>`
      select to_char("paidOn", 'YYYY-MM') m,
        coalesce(sum(case when "amountCents" > 0 then "amountCents" else 0 end), 0)::bigint paid,
        coalesce(sum(case when "amountCents" < 0 then -"amountCents" else 0 end), 0)::bigint refunded
      from "Payment" where "organizationId" = ${organizationId} and "voidedAt" is null and "paidOn" >= ${first} group by 1`,
    db.$queryRaw<{ m: string; n: bigint }[]>`
      select to_char("chargedOn", 'YYYY-MM') m, count(*)::bigint n
      from "Charge" where "organizationId" = ${organizationId} and "voidedAt" is null and kind = 'LESSON' and "chargedOn" >= ${first} group by 1`,
  ]);
  const out: MonthMoney[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const p = paid.find((r) => r.m === key);
    const t = taught.find((r) => r.m === key);
    out.push({ month: key, label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d), collectedCents: Number(p?.paid ?? 0), refundedCents: Number(p?.refunded ?? 0), lessons: Number(t?.n ?? 0), current: key === today.slice(0, 7) });
  }
  return out;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(dateStr, -dow);
}

export interface AtRiskFamily { accountId: string; name: string; reason: string }

export async function ownerDashboard(db: PrismaClient, organizationId: string, timeZone: string, now = new Date()) {
  const today = localDateStr(now, timeZone);
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 7);
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const asOf = new Date(`${today}T00:00:00Z`);

  const [weekLessons, monthPayments, monthCharges, balances, pay, missing, leads, students, slipping, org, dormant, todayLessons, months] = await Promise.all([
    db.lesson.findMany({
      where: { organizationId, deletedAt: null, allDay: false, startsAt: { gte: zonedToUtc(weekStart, "00:00", timeZone), lt: zonedToUtc(weekEnd, "00:00", timeZone) } },
      select: { status: true, durationMin: true, students: { select: { priceCents: true } } },
    }),
    db.payment.groupBy({ by: ["kind"], where: { organizationId, voidedAt: null, paidOn: { gte: new Date(`${monthStart}T00:00:00Z`), lt: new Date(`${monthEnd}T00:00:00Z`) } }, _sum: { amountCents: true } }),
    db.charge.aggregate({ where: { organizationId, voidedAt: null, kind: "LESSON", chargedOn: { gte: new Date(`${monthStart}T00:00:00Z`), lt: new Date(`${monthEnd}T00:00:00Z`) } }, _sum: { amountCents: true }, _count: { _all: true } }),
    accountBalances(db, organizationId, asOf),
    payRun(db, organizationId, month),
    lessonsMissingNotes(db, organizationId, { from: addDays(today, -7), to: addDays(today, 1), timeZone }),
    leadCounts(db, organizationId),
    db.student.groupBy({ by: ["status"], where: { organizationId, deletedAt: null, archivedAt: null }, _count: { _all: true } }),
    db.$queryRaw<{ id: string; name: string; missed: bigint }[]>`
      select a.id, a.name, count(*)::bigint missed
      from "LessonStudent" ls join "Lesson" l on l.id = ls."lessonId" join "Student" s on s.id = ls."studentId" join "Account" a on a.id = s."accountId"
      where l."organizationId" = ${organizationId} and l."deletedAt" is null and l.status in ('CANCELLED', 'NO_SHOW')
        and l."startsAt" >= ${new Date(now.getTime() - 30 * 86400000)} and l."startsAt" <= ${now}
      group by a.id, a.name having count(*) >= 2 order by missed desc limit 10`,
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { lowBalanceAlertCents: true } }),
    archiveCandidates(db, organizationId, now),
    calendarLessons(db, organizationId, zonedToUtc(today, "00:00", timeZone), zonedToUtc(addDays(today, 1), "00:00", timeZone), timeZone),
    moneyByMonth(db, organizationId, timeZone, now, 6),
  ]);

  const live = weekLessons.filter((l) => l.status !== "CANCELLED");
  const week = {
    from: weekStart, to: addDays(weekEnd, -1),
    lessons: live.length,
    done: weekLessons.filter((l) => l.status === "COMPLETED").length,
    left: weekLessons.filter((l) => l.status === "SCHEDULED").length,
    cancelled: weekLessons.filter((l) => l.status === "CANCELLED").length,
    noShows: weekLessons.filter((l) => l.status === "NO_SHOW").length,
    hours: Math.round(live.reduce((s, l) => s + l.durationMin, 0) / 6) / 10,
    chargedCents: live.reduce((s, l) => s + l.students.reduce((x, st) => x + st.priceCents, 0), 0),
  };
  const collected = Number(monthPayments.find((p) => p.kind === "PAYMENT")?._sum.amountCents ?? 0);
  const refunded = Math.abs(Number(monthPayments.find((p) => p.kind === "REFUND")?._sum.amountCents ?? 0));
  const lessonsCharged = Number(monthCharges._sum.amountCents ?? 0);
  const monthly = { month, collectedCents: collected, refundedCents: refunded, lessonsChargedCents: lessonsCharged, lessonsCharged: monthCharges._count._all, tutorPayCents: pay.totalCents, marginCents: lessonsCharged - pay.totalCents, unpricedLessons: pay.unpriced };

  const owing = balances.filter((b) => b.balanceCents > 0);
  const money = { owedCents: owing.reduce((s, b) => s + b.balanceCents, 0), owingFamilies: owing.length, creditHeldCents: balances.filter((b) => b.balanceCents < 0).reduce((s, b) => s - b.balanceCents, 0) };

  const atRisk: AtRiskFamily[] = [];
  const seen = new Set<string>();
  for (const r of slipping) { atRisk.push({ accountId: r.id, name: r.name, reason: `${Number(r.missed)} cancelled or missed in 30 days` }); seen.add(r.id); }
  if (org.lowBalanceAlertCents) {
    for (const b of owing) if (b.balanceCents >= org.lowBalanceAlertCents && !seen.has(b.accountId)) atRisk.push({ accountId: b.accountId, name: b.name, reason: "over the balance threshold" });
  }

  const count = (st: string) => students.find((s) => s.status === st)?._count._all ?? 0;
  return {
    today, week, monthly, money, atRisk,
    notesMissing: missing.reduce((s, l) => s + l.students.length, 0),
    notesMissingLessons: missing.slice(0, 8),
    leads: { open: leads.INQUIRY + leads.CONSULT_BOOKED + leads.TRIAL, inquiries: leads.INQUIRY },
    students: { active: count("ACTIVE"), paused: count("PAUSED"), graduated: count("GRADUATED") },
    /** Active students with no lesson in 60 days and nothing booked: pause, graduate, or archive them. */
    dormant,
    /** Today's lessons in the school's zone, cancelled ones included and flagged. */
    todayLessons,
    /** Money collected per month, last six months, for the chart. */
    months,
  };
}
