/**
 * Reports: revenue, lessons, outstanding balances, tutor pay, and the year
 * summary. Everything is derived from charges, payments, lessons, and
 * expenses; nothing here is stored.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr } from "../lib/tz";
import { type TaxTreatment, deductibleCents } from "./expenses";
import { payForLesson, payRuleFor } from "./payroll";

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

/** `asOf` is a calendar day in the school's zone (see localDateOnly), not an instant. */
export async function yearSummary(db: PrismaClient, organizationId: string, year: number, asOf: Date): Promise<YearSummary> {
  const asOfStr = asOf.toISOString().slice(0, 10);
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
          coalesce((select sum("amountCents") from "Charge" where "accountId" = a.id and "voidedAt" is null and "chargedOn" <= ${asOfStr}::date), 0)
          - coalesce((select sum("amountCents") from "Payment" where "accountId" = a.id and "voidedAt" is null and "paidOn" <= ${asOfStr}::date), 0) as b
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

/** Lessons taught per tutor in a date range, with pay under each tutor's rules. */
export async function tutorPay(db: PrismaClient, organizationId: string, from: Date, to: Date): Promise<TutorPayRow[]> {
  const [tutors, lessons] = await Promise.all([
    db.tutor.findMany({ where: { organizationId }, include: { payRates: true }, orderBy: { name: "asc" } }),
    db.lesson.findMany({
      where: { organizationId, tutorId: { not: null }, deletedAt: null, status: { not: "CANCELLED" }, startsAt: { gte: from, lt: to } },
      select: { tutorId: true, durationMin: true, subject: true, students: { select: { priceCents: true } } },
    }),
  ]);
  return tutors.map((t) => {
    const mine = lessons.filter((l) => l.tutorId === t.id);
    let minutes = 0, charged = 0, pay = 0, priced = 0;
    for (const l of mine) {
      const c = l.students.reduce((s, x) => s + x.priceCents, 0);
      minutes += l.durationMin;
      charged += c;
      const p = payForLesson(payRuleFor(t, l.subject), l.durationMin, c);
      if (p != null) { pay += p; priced++; }
    }
    const hasRule = t.hourlyPayRateCents != null || t.payPercent != null || t.payRates.some((r) => r.hourlyPayRateCents != null || r.payPercent != null);
    return { tutorId: t.id, tutorName: t.name, hourlyPayRateCents: t.hourlyPayRateCents, lessons: mine.length, minutes, chargedCents: charged, payCents: !hasRule || (mine.length > 0 && priced === 0) ? null : pay };
  });
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

export interface IncomeByKind {
  tutoringCents: number;
  counselingCents: number;
  uncategorizedLessonsCents: number;
  feesCents: number;
  tipsCents: number;
  otherChargesCents: number;
  /** Money received in the year that has not been applied to any charge yet (credit on accounts). */
  unappliedCents: number;
  refundsCents: number;
  receivedCents: number;
}

/**
 * Money received in a year, split by what it paid for. A payment's allocations
 * say which charges it covered, so a January payment for December lessons
 * counts as tutoring income in January, which is when the cash came in.
 */
export async function incomeByKind(db: PrismaClient, organizationId: string, year: number): Promise<IncomeByKind> {
  const from = dateOnlyFromStr(`${year}-01-01`);
  const to = dateOnlyFromStr(`${year}-12-31`);
  const [split, totals] = await Promise.all([
    db.$queryRaw<{ bucket: string; cents: bigint }[]>`
      select case
               when c.kind = 'LESSON' and l.category = 'TUTORING' then 'tutoring'
               when c.kind = 'LESSON' and l.category = 'COLLEGE_COUNSELING' then 'counseling'
               when c.kind = 'LESSON' then 'lessons'
               when c.kind = 'FEE' then 'fees'
               when c.kind = 'TIP' then 'tips'
               else 'other'
             end as bucket,
             coalesce(sum(al."amountCents"), 0)::bigint as cents
      from "Allocation" al
      join "Payment" p on p.id = al."paymentId"
      join "Charge" c on c.id = al."chargeId"
      left join "LessonStudent" ls on ls.id = c."lessonStudentId"
      left join "Lesson" l on l.id = ls."lessonId"
      where p."organizationId" = ${organizationId} and p."voidedAt" is null and p.kind = 'PAYMENT' and p."paidOn" between ${from} and ${to}
      group by 1`,
    db.$queryRaw<{ received: bigint; refunds: bigint }[]>`
      select coalesce(sum(case when kind = 'PAYMENT' then "amountCents" else 0 end), 0)::bigint received,
             coalesce(sum(case when kind = 'REFUND' then -"amountCents" else 0 end), 0)::bigint refunds
      from "Payment" where "organizationId" = ${organizationId} and "voidedAt" is null and "paidOn" between ${from} and ${to}`,
  ]);
  const get = (b: string) => Number(split.find((r) => r.bucket === b)?.cents ?? 0);
  const received = Number(totals[0]?.received ?? 0);
  const applied = split.reduce((s, r) => s + Number(r.cents), 0);
  return {
    tutoringCents: get("tutoring"),
    counselingCents: get("counseling"),
    uncategorizedLessonsCents: get("lessons"),
    feesCents: get("fees"),
    tipsCents: get("tips"),
    otherChargesCents: get("other"),
    unappliedCents: received - applied,
    refundsCents: Number(totals[0]?.refunds ?? 0),
    receivedCents: received,
  };
}
