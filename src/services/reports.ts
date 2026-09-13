/**
 * Reports: revenue, lessons, outstanding balances, tutor pay, and the year
 * summary. Everything is derived from charges, payments, lessons, and
 * expenses; nothing here is stored.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr } from "../lib/tz";
import { type TaxTreatment, deductibleCents } from "./expenses";

export interface MonthRow {
  month: string; // YYYY-MM
  paidCents: number;
  refundedCents: number;
  chargedCents: number;
  lessons: number;
  minutes: number;
  expenseCents: number;
}

/** Month by month for a calendar year: money in, refunds, lessons charged, and expenses. */
export async function monthlyReport(db: PrismaClient, organizationId: string, year: number): Promise<MonthRow[]> {
  const from = dateOnlyFromStr(`${year}-01-01`);
  const to = dateOnlyFromStr(`${year}-12-31`);
  const [payments, charges, expenses] = await Promise.all([
    db.$queryRaw<{ m: string; paid: bigint; refunded: bigint }[]>`
      select to_char("paidOn", 'YYYY-MM') m,
        coalesce(sum(case when "amountCents" > 0 then "amountCents" else 0 end), 0)::bigint paid,
        coalesce(sum(case when "amountCents" < 0 then -"amountCents" else 0 end), 0)::bigint refunded
      from "Payment" where "organizationId" = ${organizationId} and "voidedAt" is null and "paidOn" between ${from} and ${to} group by 1`,
    db.$queryRaw<{ m: string; charged: bigint; lessons: bigint; minutes: bigint }[]>`
      select to_char(c."chargedOn", 'YYYY-MM') m, coalesce(sum(c."amountCents"), 0)::bigint charged,
        count(ls.id)::bigint lessons, coalesce(sum(l."durationMin"), 0)::bigint minutes
      from "Charge" c left join "LessonStudent" ls on ls.id = c."lessonStudentId" left join "Lesson" l on l.id = ls."lessonId"
      where c."organizationId" = ${organizationId} and c."voidedAt" is null and c.kind = 'LESSON' and c."chargedOn" between ${from} and ${to} group by 1`,
    db.$queryRaw<{ m: string; spent: bigint }[]>`
      select to_char("spentOn", 'YYYY-MM') m, coalesce(sum("amountCents"), 0)::bigint spent
      from "Expense" where "organizationId" = ${organizationId} and "voidedAt" is null and "spentOn" between ${from} and ${to} group by 1`,
  ]);
  const rows: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const p = payments.find((r) => r.m === key);
    const c = charges.find((r) => r.m === key);
    const e = expenses.find((r) => r.m === key);
    rows.push({
      month: key, paidCents: Number(p?.paid ?? 0), refundedCents: Number(p?.refunded ?? 0), chargedCents: Number(c?.charged ?? 0),
      lessons: Number(c?.lessons ?? 0), minutes: Number(c?.minutes ?? 0), expenseCents: Number(e?.spent ?? 0),
    });
  }
  return rows;
}

export interface YearSummary {
  year: number;
  receivedCents: number;
  refundedCents: number;
  netIncomeCents: number;
  lessonsChargedCents: number;
  lessons: number;
  hours: number;
  expenseCents: number;
  deductibleCents: number;
  profitCents: number;
  activeStudents: number;
  averageLessonCents: number;
  outstandingCents: number;
  creditHeldCents: number;
}

export async function yearSummary(db: PrismaClient, organizationId: string, year: number, asOf: Date): Promise<YearSummary> {
  const months = await monthlyReport(db, organizationId, year);
  const received = months.reduce((s, r) => s + r.paidCents, 0);
  const refunded = months.reduce((s, r) => s + r.refundedCents, 0);
  const lessonsCharged = months.reduce((s, r) => s + r.chargedCents, 0);
  const lessons = months.reduce((s, r) => s + r.lessons, 0);
  const minutes = months.reduce((s, r) => s + r.minutes, 0);
  const from = dateOnlyFromStr(`${year}-01-01`);
  const to = dateOnlyFromStr(`${year}-12-31`);
  const [taxYear, expenses, students, balances] = await Promise.all([
    db.taxYear.findUnique({ where: { organizationId_year: { organizationId, year } } }),
    db.expense.findMany({ where: { organizationId, voidedAt: null, spentOn: { gte: from, lte: to } }, select: { amountCents: true, taxTreatment: true, businessPercent: true } }),
    db.$queryRaw<{ n: bigint }[]>`
      select count(distinct c."studentId")::bigint n from "Charge" c
      where c."organizationId" = ${organizationId} and c."voidedAt" is null and c.kind = 'LESSON' and c."chargedOn" between ${from} and ${to}`,
    db.$queryRaw<{ owed: bigint; credit: bigint }[]>`
      select coalesce(sum(case when b > 0 then b else 0 end), 0)::bigint owed, coalesce(sum(case when b < 0 then -b else 0 end), 0)::bigint credit from (
        select a.id,
          coalesce((select sum("amountCents") from "Charge" where "accountId" = a.id and "voidedAt" is null and "chargedOn" <= ${asOf}::date), 0)
          - coalesce((select sum("amountCents") from "Payment" where "accountId" = a.id and "voidedAt" is null and "paidOn" <= ${asOf}::date), 0) as b
        from "Account" a where a."organizationId" = ${organizationId}) x`,
  ]);
  const bps = taxYear?.homeOfficeBasisPoints ?? 0;
  const expenseCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  const deductible = expenses.reduce((s, e) => s + deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, bps), 0);
  return {
    year, receivedCents: received, refundedCents: refunded, netIncomeCents: received - refunded, lessonsChargedCents: lessonsCharged, lessons,
    hours: Math.round(minutes / 6) / 10, expenseCents, deductibleCents: deductible, profitCents: received - refunded - deductible,
    activeStudents: Number(students[0]?.n ?? 0), averageLessonCents: lessons ? Math.round(lessonsCharged / lessons) : 0,
    outstandingCents: Number(balances[0]?.owed ?? 0), creditHeldCents: Number(balances[0]?.credit ?? 0),
  };
}

export interface TutorPayRow {
  tutorId: string;
  tutorName: string;
  hourlyPayRateCents: number | null;
  lessons: number;
  minutes: number;
  chargedCents: number;
  payCents: number | null;
}

/** Lessons taught per tutor in a date range, with pay when a rate is set. */
export async function tutorPay(db: PrismaClient, organizationId: string, from: Date, to: Date): Promise<TutorPayRow[]> {
  const rows = await db.$queryRaw<{ id: string; name: string; rate: number | null; lessons: bigint; minutes: bigint; charged: bigint }[]>`
    select t.id, t.name, t."hourlyPayRateCents" rate, count(distinct l.id)::bigint lessons,
      coalesce(sum(l."durationMin"), 0)::bigint minutes, coalesce(sum(ls."priceCents"), 0)::bigint charged
    from "Tutor" t
    left join "Lesson" l on l."tutorId" = t.id and l."deletedAt" is null and l.status <> 'CANCELLED' and l."startsAt" >= ${from} and l."startsAt" < ${to}
    left join "LessonStudent" ls on ls."lessonId" = l.id
    where t."organizationId" = ${organizationId}
    group by t.id, t.name, t."hourlyPayRateCents" order by t.name`;
  return rows.map((r) => ({
    tutorId: r.id, tutorName: r.name, hourlyPayRateCents: r.rate, lessons: Number(r.lessons), minutes: Number(r.minutes), chargedCents: Number(r.charged),
    payCents: r.rate == null ? null : Math.round((Number(r.minutes) / 60) * r.rate),
  }));
}

export interface StudentYearRow {
  studentId: string;
  name: string;
  lessons: number;
  minutes: number;
  chargedCents: number;
}

export async function studentsByRevenue(db: PrismaClient, organizationId: string, year: number): Promise<StudentYearRow[]> {
  const from = dateOnlyFromStr(`${year}-01-01`);
  const to = dateOnlyFromStr(`${year}-12-31`);
  const rows = await db.$queryRaw<{ id: string; name: string; lessons: bigint; minutes: bigint; charged: bigint }[]>`
    select s.id, s."firstName" || ' ' || s."lastName" name, count(ls.id)::bigint lessons, coalesce(sum(l."durationMin"), 0)::bigint minutes, coalesce(sum(c."amountCents"), 0)::bigint charged
    from "Charge" c join "LessonStudent" ls on ls.id = c."lessonStudentId" join "Lesson" l on l.id = ls."lessonId" join "Student" s on s.id = c."studentId"
    where c."organizationId" = ${organizationId} and c."voidedAt" is null and c.kind = 'LESSON' and c."chargedOn" between ${from} and ${to}
    group by s.id, name order by charged desc`;
  return rows.map((r) => ({ studentId: r.id, name: r.name, lessons: Number(r.lessons), minutes: Number(r.minutes), chargedCents: Number(r.charged) }));
}
