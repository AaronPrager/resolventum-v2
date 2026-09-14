/** Login behavior. Runs without the saved cookie. */
import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./credentials";

test.use({ storageState: { cookies: [], origins: [] } });

test("without a session every page goes to login and comes back after", async ({ page }) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login\?next=%2Fstudents/);
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
});

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("login-form").getByRole("alert")).toHaveText("Email or password is wrong");
  await expect(page).toHaveURL(/\/login/);
});

test("sign out ends the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
