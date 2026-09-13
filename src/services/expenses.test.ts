/** Runs against the local resolventum_v2 database after `npm run import`. Cleans up what it makes. */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { ExpenseError, createExpense, createRecurring, deductibleCents, listCategories, runRecurring, setTaxYear, taxCsv, taxSummary, touchVendor, updateExpense, voidExpense } from "./expenses";

let orgId: string;
const expenses: string[] = [];
const recurring: string[] = [];
const vendors: string[] = [];

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow()).id;
});
afterEach(async () => {
  await prisma.expense.deleteMany({ where: { id: { in: expenses.splice(0) } } });
  await prisma.expense.deleteMany({ where: { recurringExpenseId: { in: recurring } } });
  await prisma.recurringExpense.deleteMany({ where: { id: { in: recurring.splice(0) } } });
  await prisma.vendor.deleteMany({ where: { id: { in: vendors.splice(0) } } });
  await prisma.taxYear.deleteMany({ where: { organizationId: orgId, year: 2099 } });
});

describe("deductible math", () => {
  it("applies each treatment", () => {
    expect(deductibleCents({ amountCents: 10000, taxTreatment: "BUSINESS_DIRECT", businessPercent: null }, 1200)).toBe(10000);
    expect(deductibleCents({ amountCents: 10000, taxTreatment: "HOME_OFFICE_INDIRECT", businessPercent: null }, 1200)).toBe(1200);
    expect(deductibleCents({ amountCents: 10000, taxTreatment: "PARTIAL_USE", businessPercent: 30 }, 1200)).toBe(3000);
    expect(deductibleCents({ amountCents: 10000, taxTreatment: "PERSONAL", businessPercent: null }, 1200)).toBe(0);
    expect(deductibleCents({ amountCents: 9999, taxTreatment: "HOME_OFFICE_INDIRECT", businessPercent: null }, 1250)).toBe(1250);
  });
});

describe("expenses", () => {
  it("the imported 2025 tax summary uses the 12 percent home office share", async () => {
    const s = await taxSummary(prisma, orgId, 2025);
    expect(s.homeOfficeBps).toBe(1200);
    const home = s.byTreatment.find((t) => t.treatment === "HOME_OFFICE_INDIRECT")!;
    expect(home.grossCents).toBe(5808210);
    expect(home.deductibleCents).toBe(Math.round(5808210 * 0.12));
    const direct = s.byTreatment.find((t) => t.treatment === "BUSINESS_DIRECT")!;
    expect(direct.deductibleCents).toBe(direct.grossCents);
    expect(s.deductibleCents).toBeLessThan(s.grossCents);
    expect(s.lines.length).toBeGreaterThan(3);
    expect(s.warnings).toEqual([]);
  });

  it("creates, edits, and voids an expense, and remembers the vendor's defaults", async () => {
    const cats = await listCategories(prisma, orgId);
    const supplies = cats.find((c) => c.name === "Supplies")!;
    const e = await createExpense(prisma, orgId, { spentOn: "2099-03-04", description: "Markers", vendorName: "Test Vendor Co", amountCents: 1849, categoryId: supplies.id, taxTreatment: "BUSINESS_DIRECT" });
    expenses.push(e.id);
    const v = await prisma.vendor.findFirstOrThrow({ where: { organizationId: orgId, name: "Test Vendor Co" } });
    vendors.push(v.id);
    expect(v.defaultCategoryId).toBe(supplies.id);
    expect(v.useCount).toBe(1);

    await updateExpense(prisma, orgId, e.id, { spentOn: "2099-03-05", description: "Markers and paper", vendorName: "test vendor co", amountCents: 2000, categoryId: supplies.id, taxTreatment: "PARTIAL_USE", businessPercent: 50 });
    const after = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.amountCents).toBe(2000);
    expect(after.businessPercent).toBe(50);
    expect(after.vendorId).toBe(v.id);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: v.id } })).useCount).toBe(2);

    const s = await taxSummary(prisma, orgId, 2099);
    expect(s.deductibleCents).toBe(1000);
    await voidExpense(prisma, orgId, e.id, "Duplicate");
    expect((await taxSummary(prisma, orgId, 2099)).grossCents).toBe(0);
    await expect(updateExpense(prisma, orgId, e.id, { spentOn: "2099-03-05", description: "x", amountCents: 1, categoryId: supplies.id, taxTreatment: "PERSONAL" })).rejects.toThrow(/voided/);
  });

  it("warns when home office percent is missing and the csv has one row per expense", async () => {
    const cats = await listCategories(prisma, orgId);
    const e = await createExpense(prisma, orgId, { spentOn: "2099-06-01", description: "Electric", amountCents: 12000, categoryId: cats[0].id, taxTreatment: "HOME_OFFICE_INDIRECT" });
    expenses.push(e.id);
    expect((await taxSummary(prisma, orgId, 2099)).warnings[0]).toMatch(/Home office percent/);
    await setTaxYear(prisma, orgId, 2099, { homeSqft: 2000, officeSqft: 250 });
    const s = await taxSummary(prisma, orgId, 2099);
    expect(s.homeOfficeBps).toBe(1250);
    expect(s.deductibleCents).toBe(1500);
    const csv = await taxCsv(prisma, orgId, 2099);
    expect(csv.split("\r\n")[0]).toContain("Deductible");
    expect(csv).toContain("2099-06-01");
    expect(csv).toContain(",120.00,15.00");
  });

  it("runs a monthly recurring expense up to a date, then stops at its end", async () => {
    const cats = await listCategories(prisma, orgId);
    const r = await createRecurring(prisma, orgId, { description: "Zoom", vendorName: "Zoom", amountCents: 1599, categoryId: cats[0].id, taxTreatment: "BUSINESS_DIRECT", frequency: "MONTHLY", startOn: "2099-01-10", endsOn: "2099-03-31" });
    recurring.push(r.id);
    vendors.push((await prisma.vendor.findFirstOrThrow({ where: { organizationId: orgId, name: "Zoom" } })).id);
    expect(await runRecurring(prisma, orgId, new Date("2099-02-15T00:00:00Z"), { onlyId: r.id })).toBe(2);
    expect(await runRecurring(prisma, orgId, new Date("2099-02-15T00:00:00Z"), { onlyId: r.id })).toBe(0);
    expect(await runRecurring(prisma, orgId, new Date("2099-12-31T00:00:00Z"), { onlyId: r.id })).toBe(1);
    expect((await prisma.recurringExpense.findUniqueOrThrow({ where: { id: r.id } })).active).toBe(false);
    const dates = (await prisma.expense.findMany({ where: { recurringExpenseId: r.id }, orderBy: { spentOn: "asc" } })).map((e) => e.spentOn.toISOString().slice(0, 10));
    expect(dates).toEqual(["2099-01-10", "2099-02-10", "2099-03-10"]);
  });

  it("rejects bad input", async () => {
    const cats = await listCategories(prisma, orgId);
    await expect(createExpense(prisma, orgId, { spentOn: "x", description: "a", amountCents: 1, categoryId: cats[0].id, taxTreatment: "PERSONAL" })).rejects.toThrow(ExpenseError);
    await expect(createExpense(prisma, orgId, { spentOn: "2099-01-01", description: "a", amountCents: 100, categoryId: cats[0].id, taxTreatment: "PARTIAL_USE" })).rejects.toThrow(/Business percent/);
    await expect(createExpense(prisma, orgId, { spentOn: "2099-01-01", description: "a", amountCents: 100, categoryId: "nope", taxTreatment: "PERSONAL" })).rejects.toThrow(/Category/);
    expect(await touchVendor(prisma, orgId, "   ")).toBeNull();
  });
});
