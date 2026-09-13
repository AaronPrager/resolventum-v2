/**
 * Records a payment, a refund, and a credit on a statement, checks the
 * balance, voids them, and removes what it created.
 */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";
import { rebuildAccountAllocations } from "../src/services/allocation";

test.beforeEach(({ page }) => { page.on("dialog", (d) => d.accept()); });

const TAG = `E2E money ${Date.now()}`;
let accountId: string;

test.beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  accountId = s.accountId;
});

test.afterAll(async () => {
  await prisma.payment.deleteMany({ where: { accountId, OR: [{ notes: { contains: TAG } }, { refundReason: { contains: TAG } }] } });
  await prisma.charge.deleteMany({ where: { accountId, description: { contains: TAG } } });
  await rebuildAccountAllocations(prisma, accountId);
  await prisma.$disconnect();
});

const closing = (page: import("@playwright/test").Page) => page.getByTestId("closing-balance");

test("record a payment, a refund, and a credit, then void them", async ({ page }) => {
  await page.goto(`/accounts/${accountId}`);
  await expect(closing(page)).toContainText("credit $130.00");

  // Payment of 200 by Zelle.
  const pay = page.getByTestId("payment-form");
  await pay.getByLabel("Amount").fill("200");
  await pay.getByLabel("Date").fill("2026-09-12");
  await pay.getByLabel("How").selectOption("ZELLE");
  await pay.getByLabel("Notes, or reason for a refund").fill(`${TAG} payment`);
  await pay.getByRole("button", { name: "Record" }).click();
  await expect(pay.getByRole("status")).toHaveText("Payment recorded");
  await expect(closing(page)).toContainText("credit $330.00");

  // Refund of 50.
  await pay.getByLabel("Kind").selectOption("REFUND");
  await pay.getByLabel("Amount").fill("50");
  await pay.getByLabel("Notes, or reason for a refund").fill(`${TAG} refund`);
  await pay.getByRole("button", { name: "Record" }).click();
  await expect(pay.getByRole("status")).toHaveText("Refund recorded");
  await expect(closing(page)).toContainText("credit $280.00");

  // Credit of 30 to the family.
  const adj = page.getByTestId("adjustment-form");
  await adj.getByLabel("Amount").fill("30");
  await adj.getByLabel("Description").fill(`${TAG} credit`);
  await adj.getByRole("button", { name: "Record" }).click();
  await expect(adj.getByRole("status")).toHaveText("Credit recorded");
  await expect(closing(page)).toContainText("credit $310.00");

  // The rows are on the statement.
  const statement = page.getByTestId("statement");
  await expect(statement.getByRole("row", { name: new RegExp(`${TAG} payment`) })).toContainText("$200.00");
  await expect(statement.getByRole("row", { name: /Refund: .*refund/ })).toContainText("$50.00");
  await expect(statement.getByRole("row", { name: new RegExp(`${TAG} credit`) })).toContainText("adjustment");

  // Void the payment and the credit: balance goes back to 130 minus the refund.
  await statement.getByRole("button", { name: `Void ${TAG} payment` }).click();
  await expect(closing(page)).toContainText("credit $110.00");
  await statement.getByRole("button", { name: `Void ${TAG} credit` }).click();
  await expect(closing(page)).toContainText("credit $80.00");
  await expect(page.getByText(/voided entries are not shown/)).toBeVisible();

  // The refund still shows on the month's payments list.
  await page.goto("/payments?month=2026-09");
  const row = page.getByTestId("payments").getByRole("row", { name: new RegExp(`${TAG} refund`) });
  await expect(row).toContainText("-$50.00");
  await expect(row).toContainText("Estella Urman");
});

test("the payment form rejects a bad amount", async ({ page }) => {
  await page.goto(`/accounts/${accountId}`);
  const pay = page.getByTestId("payment-form");
  await pay.getByLabel("Amount").fill("12.345");
  await pay.getByRole("button", { name: "Record" }).click();
  await expect(pay.getByRole("alert")).toContainText("Amount must be a number");
});
