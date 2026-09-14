/**
 * Tutor pay for a month: the lessons a tutor taught, hours times their rate,
 * and recording the payout as a Contract Labor expense (once per tutor and month).
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { formatTime } from "../lib/format";
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

export interface PayLesson { date: string; time: string; students: string; subject: string; minutes: number }

export async function tutorMonth(db: PrismaClient, organizationId: string, tutorId: string, month: string) {
  const tutor = await db.tutor.findFirst({ where: { id: tutorId, organizationId }, include: { organization: true } });
  if (!tutor) throw new PayrollError("Tutor not found");
  const tz = tutor.organization.timezone;
  const b = monthBounds(month);
  const lessons = await db.lesson.findMany({
    where: { organizationId, tutorId, deletedAt: null, status: { not: "CANCELLED" }, allDay: false, startsAt: { gte: zonedToUtc(b.first, "00:00", tz), lt: zonedToUtc(b.next, "00:00", tz) } },
    include: { students: { include: { student: { select: { firstName: true, lastName: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const rows: PayLesson[] = lessons.map((l) => ({
    date: localDateStr(l.startsAt, tz),
    time: formatTime(l.startsAt, tz),
    students: l.students.map((s) => `${s.student.firstName} ${s.student.lastName}`).join(", ") || "(no student)",
    subject: l.subject,
    minutes: l.durationMin,
  }));
  const minutes = rows.reduce((s, r) => s + r.minutes, 0);
  const rate = tutor.hourlyPayRateCents;
  const payCents = rate == null ? null : Math.round((minutes / 60) * rate);
  const description = `Tutor pay, ${b.label}`;
  const recorded = await db.expense.findFirst({ where: { organizationId, tutorId, description, voidedAt: null } });
  return { tutor, month, label: b.label, lastDay: b.last, lessons: rows, minutes, rateCents: rate, payCents, description, recorded };
}

/** Book the month's pay as an expense dated the last day of the month. Refuses a second one. */
export async function recordTutorPay(db: PrismaClient, organizationId: string, tutorId: string, month: string, createdById?: string | null) {
  const m = await tutorMonth(db, organizationId, tutorId, month);
  if (m.rateCents == null) throw new PayrollError(`Set a pay rate for ${m.tutor.name} first`);
  if (!m.payCents) throw new PayrollError(`${m.tutor.name} has no hours in ${m.label}`);
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
    notes: `${m.lessons.length} lessons, ${(m.minutes / 60).toFixed(2)} hours at ${(m.rateCents / 100).toFixed(2)} per hour`,
  }, createdById);
}
