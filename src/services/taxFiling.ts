/**
 * Marking a tax year as reported: every payment and expense in the year gets
 * taxReportedAt, so later edits are refused and the numbers you filed stay put.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr } from "../lib/tz";

function range(year: number) {
  return { gte: dateOnlyFromStr(`${year}-01-01`), lte: dateOnlyFromStr(`${year}-12-31`) };
}

export async function taxFilingStatus(db: PrismaClient, organizationId: string, year: number) {
  const [payments, paymentsReported, expenses, expensesReported] = await Promise.all([
    db.payment.count({ where: { organizationId, voidedAt: null, paidOn: range(year) } }),
    db.payment.count({ where: { organizationId, voidedAt: null, paidOn: range(year), taxReportedAt: { not: null } } }),
    db.expense.count({ where: { organizationId, voidedAt: null, spentOn: range(year) } }),
    db.expense.count({ where: { organizationId, voidedAt: null, spentOn: range(year), taxReportedAt: { not: null } } }),
  ]);
  return { payments, paymentsReported, expenses, expensesReported };
}

/** Mark (or unmark) the whole year. Returns how many rows changed. */
export async function setYearReported(db: PrismaClient, organizationId: string, year: number, reported: boolean, now = new Date()) {
  const data = { taxReportedAt: reported ? now : null };
  const [p, e] = await db.$transaction([
    db.payment.updateMany({ where: { organizationId, voidedAt: null, paidOn: range(year), taxReportedAt: reported ? null : { not: null } }, data }),
    db.expense.updateMany({ where: { organizationId, voidedAt: null, spentOn: range(year), taxReportedAt: reported ? null : { not: null } }, data }),
  ]);
  return { payments: p.count, expenses: e.count };
}
