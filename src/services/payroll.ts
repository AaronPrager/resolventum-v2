/**
 * Tutor pay for a month: the lessons a tutor taught, what each one pays, and
 * recording the payout as a Contract Labor expense (once per tutor and month).
 *
 * A tutor is paid per hour taught or a percent of what the lesson charged,
 * with a different rule per subject when the owner sets one. Percent wins
 * when both are set on the same rule.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { formatCents, formatTime } from "../lib/format";
import { localDateStr, zonedToUtc } from "../lib/tz";
import { createExpense } from "./expenses";

export class PayrollError extends Error {}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new PayrollError("Month must look like 2026-09");
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));
  return { first, next, last, label };
}

// ---------------------------------------------------------------- pay rules

export interface PayRule { hourlyCents: number | null; percent: number | null }
export interface TutorPayProfile {
  hourlyPayRateCents: number | null;
  payPercent: number | null;
  payRates: { subject: string; hourlyPayRateCents: number | null; payPercent: number | null }[];
}

/** The rule for one subject: the per-subject override when there is one, else the tutor's default. */
export function payRuleFor(tutor: TutorPayProfile, subject: string): PayRule {
  const key = subject.trim().toLowerCase();
  const o = tutor.payRates.find((r) => r.subject.trim().toLowerCase() === key);
  if (o && (o.hourlyPayRateCents != null || o.payPercent != null)) return { hourlyCents: o.hourlyPayRateCents, percent: o.payPercent };
  return { hourlyCents: tutor.hourlyPayRateCents, percent: tutor.payPercent };
}

/** What one lesson pays under a rule, or null when the rule is empty. */
export function payForLesson(rule: PayRule, minutes: number, chargedCents: number): number | null {
  if (rule.percent != null) return Math.round((chargedCents * rule.percent) / 100);
  if (rule.hourlyCents != null) return Math.round((minutes / 60) * rule.hourlyCents);
  return null;
}

export function describeRule(rule: PayRule): string {
  if (rule.percent != null) return `${rule.percent}% of the lesson price`;
  if (rule.hourlyCents != null) return `${formatCents(rule.hourlyCents)} per hour`;
  return "not set";
}

/** One line for the tutor: "$40.00 per hour" when every subject pays the same, else "by subject". */
export function describeTutorPay(tutor: TutorPayProfile): string {
  const base = describeRule({ hourlyCents: tutor.hourlyPayRateCents, percent: tutor.payPercent });
  const overrides = tutor.payRates.filter((r) => r.hourlyPayRateCents != null || r.payPercent != null);
  if (overrides.length === 0) return base;
  return base === "not set" ? "by subject" : `${base}, by subject for ${overrides.map((r) => r.subject).join(", ")}`;
}

export interface PayLesson { date: string; time: string; students: string; subject: string; minutes: number; chargedCents: number; payCents: number | null; basis: string }

export async function tutorMonth(db: PrismaClient, organizationId: string, tutorId: string, month: string) {
  const tutor = await db.tutor.findFirst({ where: { id: tutorId, organizationId }, include: { organization: true, payRates: true } });
  if (!tutor) throw new PayrollError("Tutor not found");
  const tz = tutor.organization.timezone;
  const b = monthBounds(month);
  const lessons = await db.lesson.findMany({
    where: { organizationId, tutorId, deletedAt: null, status: { not: "CANCELLED" }, allDay: false, startsAt: { gte: zonedToUtc(b.first, "00:00", tz), lt: zonedToUtc(b.next, "00:00", tz) } },
    include: { students: { include: { student: { select: { firstName: true, lastName: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const rows: PayLesson[] = lessons.map((l) => {
    const chargedCents = l.students.reduce((s, x) => s + x.priceCents, 0);
    const rule = payRuleFor(tutor, l.subject);
    const payCents = payForLesson(rule, l.durationMin, chargedCents);
    const basis = rule.percent != null ? `${rule.percent}% of ${formatCents(chargedCents)}` : rule.hourlyCents != null ? `${(l.durationMin / 60).toFixed(2)} h at ${formatCents(rule.hourlyCents)}` : "no rate";
    return { date: localDateStr(l.startsAt, tz), time: formatTime(l.startsAt, tz), students: l.students.map((s) => `${s.student.firstName} ${s.student.lastName}`).join(", ") || "(no student)", subject: l.subject, minutes: l.durationMin, chargedCents, payCents, basis };
  });
  const minutes = rows.reduce((s, r) => s + r.minutes, 0);
  const chargedCents = rows.reduce((s, r) => s + r.chargedCents, 0);
  const unpriced = rows.filter((r) => r.payCents == null).length;
  const hasRule = tutor.hourlyPayRateCents != null || tutor.payPercent != null || tutor.payRates.some((r) => r.hourlyPayRateCents != null || r.payPercent != null);
  const payCents = !hasRule || (rows.length > 0 && unpriced === rows.length) ? null : rows.reduce((s, r) => s + (r.payCents ?? 0), 0);
  const rateLabel = describeTutorPay(tutor);
  const description = `Tutor pay, ${b.label}`;
  const recorded = await db.expense.findFirst({ where: { organizationId, tutorId, description, voidedAt: null } });
  return { tutor, month, label: b.label, lastDay: b.last, lessons: rows, minutes, chargedCents, rateCents: tutor.hourlyPayRateCents, rateLabel, unpriced, payCents, description, recorded };
}

/** Book the month's pay as an expense dated the last day of the month. Refuses a second one. */
export async function recordTutorPay(db: PrismaClient, organizationId: string, tutorId: string, month: string, createdById?: string | null) {
  const m = await tutorMonth(db, organizationId, tutorId, month);
  if (m.payCents == null && m.lessons.length > 0) throw new PayrollError(`Set a pay rate for ${m.tutor.name} first`);
  if (!m.payCents) throw new PayrollError(`${m.tutor.name} has no hours in ${m.label}`);
  if (m.unpriced > 0) throw new PayrollError(`${m.unpriced} lesson${m.unpriced === 1 ? " has" : "s have"} no pay rule. Set a default rate for ${m.tutor.name} or one for that subject.`);
  if (m.recorded) throw new PayrollError(`${m.label} is already recorded for ${m.tutor.name}`);
  const category = await db.expenseCategory.findFirst({ where: { name: "Contract Labor", archivedAt: null, OR: [{ organizationId }, { organizationId: null }] }, orderBy: { organizationId: "desc" } });
  if (!category) throw new PayrollError("There is no Contract Labor expense category");
  return createExpense(db, organizationId, {
    spentOn: m.lastDay,
    description: m.description,
    vendorName: m.tutor.name,
    amountCents: m.payCents,
    categoryId: category.id,
    taxTreatment: "BUSINESS_DIRECT",
    tutorId,
    notes: `${m.lessons.length} lessons, ${(m.minutes / 60).toFixed(2)} hours, ${m.rateLabel}`,
  }, createdById);
}

/** Every tutor's pay for a month, for the pay run and the dashboard. */
export async function payRun(db: PrismaClient, organizationId: string, month: string) {
  const tutors = await db.tutor.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true } });
  const rows = await Promise.all(tutors.map((t) => tutorMonth(db, organizationId, t.id, month)));
  return { rows, totalCents: rows.reduce((s, r) => s + (r.payCents ?? 0), 0), unpriced: rows.reduce((s, r) => s + r.unpriced, 0) };
}
