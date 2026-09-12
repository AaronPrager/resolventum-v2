/** Against the dev server and the imported data. Run `npm run import` first. */
import { expect, test } from "@playwright/test";

test("home lists accounts with balances", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Easy STEM School" })).toBeVisible();
  await expect(page.getByText("94 accounts.")).toBeVisible();
  const lina = page.getByTestId("balances").getByRole("row", { name: /Lina Vernik/ });
  await expect(lina).toContainText("credit $260.00");
});

test("account statement runs a balance forward", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Estella Urman" }).click();
  await expect(page.getByRole("heading", { name: "Estella Urman" })).toBeVisible();
  await expect(page.getByTestId("closing-balance")).toContainText("credit $130.00");
  const rows = page.getByTestId("statement").locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect(rows.last()).toContainText("credit $130.00");
});

test("statement can be narrowed to a period", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Estella Urman" }).click();
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-01-31");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/from=2026-01-01/);
  await expect(page.getByText("Opening balance")).toBeVisible();
});
