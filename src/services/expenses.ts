/**
 * Expenses and the tax summary.
 *
 * Deductible rules (Schedule C style):
 *   BUSINESS_DIRECT       100 percent
 *   HOME_OFFICE_INDIRECT  the tax year's home office percent
 *   PARTIAL_USE           the expense's own business percent
 *   PERSONAL              nothing
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr, dateOnlyStr } from "../lib/tz";

export class ExpenseError extends Error {}

export type TaxTreatment = "BUSINESS_DIRECT" | "HOME_OFFICE_INDIRECT" | "PARTIAL_USE" | "PERSONAL";
export const TREATMENTS: TaxTreatment[] = ["BUSINESS_DIRECT", "HOME_OFFICE_INDIRECT", "PARTIAL_USE", "PERSONAL"];
export const TREATMENT_LABEL: Record<TaxTreatment, string> = {
  BUSINESS_DIRECT: "Business, 100%",
  HOME_OFFICE_INDIRECT: "Home office share",
  PARTIAL_USE: "Partly business",
  PERSONAL: "Personal, not deductible",
};

/** Deductible cents for one expense given the home office percent in basis points (1250 = 12.5%). */
export function deductibleCents(e: { amountCents: number; taxTreatment: TaxTreatment; businessPercent: number | null }, homeOfficeBps: number): number {
  if (e.amountCents <= 0) return 0;
  switch (e.taxTreatment) {
    case "BUSINESS_DIRECT": return e.amountCents;
    case "HOME_OFFICE_INDIRECT": return Math.round((e.amountCents * Math.min(10000, Math.max(0, homeOfficeBps))) / 10000);
    case "PARTIAL_USE": return Math.round((e.amountCents * Math.min(100, Math.max(0, e.businessPercent ?? 0))) / 100);
    case "PERSONAL": return 0;
  }
}

// ---------------------------------------------------------------- categories and vendors

export async function listCategories(db: PrismaClient, organizationId: string) {
  return db.expenseCategory.findMany({
    where: { OR: [{ organizationId: null }, { organizationId }], archivedAt: null },
    orderBy: [{ name: "asc" }],
  });
}

export async function createCategory(db: PrismaClient, organizationId: string, input: { name: string; defaultTaxTreatment: TaxTreatment; defaultBusinessPercent?: number | null; scheduleCLine?: string | null }) {
  if (!input.name.trim()) throw new ExpenseError("Name is required");
  return db.expenseCategory.create({
    data: { organizationId, name: input.name.trim(), defaultTaxTreatment: input.defaultTaxTreatment, defaultBusinessPercent: input.defaultBusinessPercent ?? null, scheduleCLine: input.scheduleCLine?.trim() || null },
  });
}

/** Find or create a vendor by name; remembers the last category and treatment used with it. */
export async function touchVendor(db: PrismaClient, organizationId: string, name: string, used?: { categoryId?: string; taxTreatment?: TaxTreatment; businessPercent?: number | null }) {
  const clean = name.trim();
  if (!clean) return null;
  const existing = await db.vendor.findFirst({ where: { organizationId, name: { equals: clean, mode: "insensitive" } } });
  const data = { lastUsedAt: new Date(), ...(used?.categoryId ? { defaultCategoryId: used.categoryId } : {}), ...(used?.taxTreatment ? { defaultTaxTreatment: used.taxTreatment } : {}), ...(used?.businessPercent != null ? { defaultBusinessPercent: used.businessPercent } : {}) };
  if (existing) return db.vendor.update({ where: { id: existing.id }, data: { ...data, useCount: { increment: 1 } } });
  return db.vendor.create({ data: { organizationId, name: clean, useCount: 1, ...data } });
}

export async function listVendors(db: PrismaClient, organizationId: string) {
  return db.vendor.findMany({ where: { organizationId }, include: { defaultCategory: { select: { name: true } } }, orderBy: [{ useCount: "desc" }, { name: "asc" }] });
}

// ---------------------------------------------------------------- expenses

export interface ExpenseInput {
  spentOn: string;
  description: string;
  vendorName?: string | null;
  amountCents: number;
  categoryId: string;
  taxTreatment: TaxTreatment;
  businessPercent?: number | null;
  paymentSourceId?: string | null;
  receiptFileId?: string | null;
  notes?: string | null;
  tutorId?: string | null;
}

function validate(input: ExpenseInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) throw new ExpenseError("Date is required");
  if (!input.description.trim()) throw new ExpenseError("Description is required");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new ExpenseError("Amount must be more than zero");
  if (!TREATMENTS.includes(input.taxTreatment)) throw new ExpenseError("Pick a tax treatment");
  if (input.taxTreatment === "PARTIAL_USE") {
    const p = input.businessPercent;
    if (p == null || !Number.isInteger(p) || p < 0 || p > 100) throw new ExpenseError("Business percent must be 0 to 100 for a partly business expense");
  }
}

export async function createExpense(db: PrismaClient, organizationId: string, input: ExpenseInput, createdById?: string | null) {
  validate(input);
  const cat = await db.expenseCategory.findFirst({ where: { id: input.categoryId, OR: [{ organizationId: null }, { organizationId }] } });
  if (!cat) throw new ExpenseError("Category not found");
  const vendor = input.vendorName ? await touchVendor(db, organizationId, input.vendorName, { categoryId: cat.id, taxTreatment: input.taxTreatment, businessPercent: input.businessPercent }) : null;
  return db.expense.create({
    data: {
      organizationId, spentOn: dateOnlyFromStr(input.spentOn), description: input.description.trim(), vendorId: vendor?.id ?? null, amountCents: input.amountCents,
      categoryId: cat.id, taxTreatment: input.taxTreatment, businessPercent: input.taxTreatment === "PARTIAL_USE" ? input.businessPercent ?? null : null,
      paymentSourceId: input.paymentSourceId || null, receiptFileId: input.receiptFileId || null, notes: input.notes?.trim() || null, tutorId: input.tutorId || null, createdById: createdById ?? null,
    },
  });
}

export async function updateExpense(db: PrismaClient, organizationId: string, expenseId: string, input: ExpenseInput) {
  validate(input);
  const e = await db.expense.findFirst({ where: { id: expenseId, organizationId } });
  if (!e) throw new ExpenseError("Expense not found");
  if (e.voidedAt) throw new ExpenseError("This expense is voided");
  const cat = await db.expenseCategory.findFirst({ where: { id: input.categoryId, OR: [{ organizationId: null }, { organizationId }] } });
  if (!cat) throw new ExpenseError("Category not found");
  const vendor = input.vendorName ? await touchVendor(db, organizationId, input.vendorName) : null;
  return db.expense.update({
    where: { id: expenseId },
    data: {
      spentOn: dateOnlyFromStr(input.spentOn), description: input.description.trim(), vendorId: vendor?.id ?? null, amountCents: input.amountCents,
      categoryId: cat.id, taxTreatment: input.taxTreatment, businessPercent: input.taxTreatment === "PARTIAL_USE" ? input.businessPercent ?? null : null,
      paymentSourceId: input.paymentSourceId || null, receiptFileId: input.receiptFileId ?? e.receiptFileId, notes: input.notes?.trim() || null, tutorId: input.tutorId || null,
    },
  });
}

export async function voidExpense(db: PrismaClient, organizationId: string, expenseId: string, reason: string) {
  const e = await db.expense.findFirst({ where: { id: expenseId, organizationId } });
  if (!e) throw new ExpenseError("Expense not found");
  if (!reason.trim()) throw new ExpenseError("A reason is required");
  await db.expense.update({ where: { id: expenseId }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
}

export async function listExpenses(db: PrismaClient, organizationId: string, from: Date, to: Date, opts: { includeVoided?: boolean } = {}) {
  return db.expense.findMany({
    where: { organizationId, spentOn: { gte: from, lte: to }, ...(opts.includeVoided ? {} : { voidedAt: null }) },
    include: { vendor: { select: { name: true } }, category: { select: { name: true } }, receipt: { select: { id: true, name: true } }, recurringExpense: { select: { id: true } } },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
  });
}

// ---------------------------------------------------------------- recurring

export async function createRecurring(db: PrismaClient, organizationId: string, input: Omit<ExpenseInput, "spentOn" | "receiptFileId"> & { frequency: "MONTHLY" | "YEARLY"; startOn: string; endsOn?: string | null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startOn)) throw new ExpenseError("Start date is required");
  validate({ ...input, spentOn: input.startOn });
  const vendor = input.vendorName ? await touchVendor(db, organizationId, input.vendorName) : null;
  return db.recurringExpense.create({
    data: {
      organizationId, description: input.description.trim(), vendorId: vendor?.id ?? null, categoryId: input.categoryId, amountCents: input.amountCents,
      taxTreatment: input.taxTreatment, businessPercent: input.taxTreatment === "PARTIAL_USE" ? input.businessPercent ?? null : null, paymentSourceId: input.paymentSourceId || null,
      frequency: input.frequency, nextOn: dateOnlyFromStr(input.startOn), endsOn: input.endsOn ? dateOnlyFromStr(input.endsOn) : null, active: true,
    },
  });
}

function stepDate(d: Date, frequency: "MONTHLY" | "YEARLY"): Date {
  const out = new Date(d);
  if (frequency === "MONTHLY") out.setUTCMonth(out.getUTCMonth() + 1);
  else out.setUTCFullYear(out.getUTCFullYear() + 1);
  return out;
}

/** Create the expenses that are due up to `today` for every active recurring expense. Returns the number made. */
export async function runRecurring(db: PrismaClient, organizationId: string, today: Date, opts: { onlyId?: string } = {}): Promise<number> {
  const rows = await db.recurringExpense.findMany({ where: { organizationId, active: true, nextOn: { lte: today }, ...(opts.onlyId ? { id: opts.onlyId } : {}) } });
  let made = 0;
  for (const r of rows) {
    let next = r.nextOn;
    await db.$transaction(async (tx) => {
      while (next <= today && (!r.endsOn || next <= r.endsOn)) {
        await tx.expense.create({
          data: {
            organizationId, spentOn: next, description: r.description, vendorId: r.vendorId, amountCents: r.amountCents, categoryId: r.categoryId,
            taxTreatment: r.taxTreatment, businessPercent: r.businessPercent, paymentSourceId: r.paymentSourceId, recurringExpenseId: r.id,
          },
        });
        made++;
        next = stepDate(next, r.frequency);
      }
      const done = r.endsOn !== null && next > r.endsOn;
      await tx.recurringExpense.update({ where: { id: r.id }, data: { nextOn: next, active: !done } });
    });
  }
  return made;
}

// ---------------------------------------------------------------- tax summary

export interface TaxLine {
  categoryId: string;
  category: string;
  scheduleCLine: string | null;
  grossCents: number;
  deductibleCents: number;
  count: number;
}
export interface TaxSummary {
  year: number;
  homeOfficeBps: number;
  filedAt: Date | null;
  lines: TaxLine[];
  byTreatment: { treatment: TaxTreatment; grossCents: number; deductibleCents: number; count: number }[];
  grossCents: number;
  deductibleCents: number;
  warnings: string[];
}

export async function taxSummary(db: PrismaClient, organizationId: string, year: number): Promise<TaxSummary> {
  const [taxYear, expenses] = await Promise.all([
    db.taxYear.findUnique({ where: { organizationId_year: { organizationId, year } } }),
    db.expense.findMany({
      where: { organizationId, voidedAt: null, spentOn: { gte: dateOnlyFromStr(`${year}-01-01`), lte: dateOnlyFromStr(`${year}-12-31`) } },
      include: { category: true },
    }),
  ]);
  const bps = taxYear?.homeOfficeBasisPoints ?? 0;
  const warnings: string[] = [];
  if (expenses.some((e) => e.taxTreatment === "HOME_OFFICE_INDIRECT") && bps === 0) warnings.push(`Home office percent for ${year} is not set, so home office expenses count as zero.`);
  const partialMissing = expenses.filter((e) => e.taxTreatment === "PARTIAL_USE" && e.businessPercent == null);
  if (partialMissing.length) warnings.push(`${partialMissing.length} partly business expense(s) have no business percent.`);

  const lines = new Map<string, TaxLine>();
  const byT = new Map<TaxTreatment, { treatment: TaxTreatment; grossCents: number; deductibleCents: number; count: number }>();
  let gross = 0;
  let ded = 0;
  for (const e of expenses) {
    const d = deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, bps);
    gross += e.amountCents;
    ded += d;
    const l = lines.get(e.categoryId) ?? { categoryId: e.categoryId, category: e.category.name, scheduleCLine: e.category.scheduleCLine, grossCents: 0, deductibleCents: 0, count: 0 };
    l.grossCents += e.amountCents; l.deductibleCents += d; l.count++;
    lines.set(e.categoryId, l);
    const t = byT.get(e.taxTreatment as TaxTreatment) ?? { treatment: e.taxTreatment as TaxTreatment, grossCents: 0, deductibleCents: 0, count: 0 };
    t.grossCents += e.amountCents; t.deductibleCents += d; t.count++;
    byT.set(e.taxTreatment as TaxTreatment, t);
  }
  return {
    year, homeOfficeBps: bps, filedAt: taxYear?.filedAt ?? null,
    lines: [...lines.values()].sort((a, b) => b.deductibleCents - a.deductibleCents),
    byTreatment: TREATMENTS.map((t) => byT.get(t)).filter((x): x is NonNullable<typeof x> => !!x),
    grossCents: gross, deductibleCents: ded, warnings,
  };
}

export async function setTaxYear(db: PrismaClient, organizationId: string, year: number, input: { homeSqft?: number | null; officeSqft?: number | null; homeOfficeBps?: number | null; filed?: boolean }) {
  let bps = input.homeOfficeBps ?? null;
  if (bps == null && input.homeSqft && input.officeSqft) bps = Math.round((input.officeSqft / input.homeSqft) * 10000);
  if (bps != null && (bps < 0 || bps > 10000)) throw new ExpenseError("Home office percent must be 0 to 100");
  return db.taxYear.upsert({
    where: { organizationId_year: { organizationId, year } },
    update: { homeSqft: input.homeSqft ?? null, officeSqft: input.officeSqft ?? null, homeOfficeBasisPoints: bps, ...(input.filed !== undefined ? { filedAt: input.filed ? new Date() : null } : {}) },
    create: { organizationId, year, homeSqft: input.homeSqft ?? null, officeSqft: input.officeSqft ?? null, homeOfficeBasisPoints: bps, filedAt: input.filed ? new Date() : null },
  });
}

/** CSV for the accountant: one row per expense with its deductible amount. */
export async function taxCsv(db: PrismaClient, organizationId: string, year: number): Promise<string> {
  const s = await taxSummary(db, organizationId, year);
  const rows = await db.expense.findMany({
    where: { organizationId, voidedAt: null, spentOn: { gte: dateOnlyFromStr(`${year}-01-01`), lte: dateOnlyFromStr(`${year}-12-31`) } },
    include: { vendor: true, category: true },
    orderBy: { spentOn: "asc" },
  });
  const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const money = (c: number) => (c / 100).toFixed(2);
  const lines = ["Date,Vendor,Description,Category,Schedule C line,Treatment,Business %,Gross,Deductible"];
  for (const e of rows) {
    const pct = e.taxTreatment === "BUSINESS_DIRECT" ? 100 : e.taxTreatment === "HOME_OFFICE_INDIRECT" ? s.homeOfficeBps / 100 : e.taxTreatment === "PARTIAL_USE" ? e.businessPercent ?? 0 : 0;
    const d = deductibleCents({ amountCents: e.amountCents, taxTreatment: e.taxTreatment as TaxTreatment, businessPercent: e.businessPercent }, s.homeOfficeBps);
    lines.push([dateOnlyStr(e.spentOn), esc(e.vendor?.name), esc(e.description), esc(e.category.name), esc(e.category.scheduleCLine), e.taxTreatment, String(pct), money(e.amountCents), money(d)].join(","));
  }
  lines.push(`,,,,,,Total,${money(s.grossCents)},${money(s.deductibleCents)}`);
  return lines.join("\r\n") + "\r\n";
}
