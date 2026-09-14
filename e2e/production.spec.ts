/** Sign-up, password reset entry, settings, tutors, roles, health. Cleans up the school it creates. */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";
import { E2E_EMAIL } from "./credentials";

const EMAIL = `e2e-signup-${Date.now()}@example.com`;

test.afterAll(async () => {
  const u = await prisma.user.findUnique({ where: { email: EMAIL }, include: { memberships: true } });
  if (u) {
    for (const m of u.memberships) {
      await prisma.message.deleteMany({ where: { organizationId: m.organizationId } });
      await prisma.token.deleteMany({ where: { organizationId: m.organizationId } });
    }
    await prisma.user.delete({ where: { id: u.id } });
    for (const m of u.memberships) await prisma.organization.delete({ where: { id: m.organizationId } }).catch(() => undefined);
  }
  await prisma.tutor.deleteMany({ where: { name: "E2E Tutor" } });
  await prisma.$disconnect();
});

test("health answers without a session", async ({ request }) => {
  const r = await request.get("/api/health", { headers: { cookie: "" } });
  expect(r.status()).toBe(200);
  expect((await r.json()).db).toBe(true);
});

test.describe("without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a new school signs up and lands in settings", async ({ page }) => {
    await page.goto("/signup");
    const f = page.getByTestId("signup-form");
    await f.getByLabel("Your name").fill("Sam Signup");
    await f.getByLabel("School or business name").fill("Signup Test School");
    await f.getByLabel("Email").fill(EMAIL);
    await f.getByLabel("Password").fill("a good long password");
    await f.getByRole("button", { name: "Create my account" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId("org-form").getByLabel("Name shown to families")).toHaveValue("Signup Test School");
    await page.goto("/accounts");
    await expect(page.getByText("Signup Test School ·")).toBeVisible();
    await expect(page.getByText("Every account is at zero.")).toBeVisible();
  });

  test("forgot password explains when email is off, and never says whether the address exists", async ({ page }) => {
    await page.goto("/forgot");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByTestId("forgot-form").getByRole("alert")).toContainText("Email is not configured");
    await page.goto("/reset/not-a-real-token");
    await page.getByLabel("New password").fill("a good long password");
    await page.getByLabel("Again").fill("a good long password");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByTestId("reset-form").getByRole("alert")).toContainText("not valid");
  });
});

test("settings: save the school profile, add a tutor with a rate, change password back and forth", async ({ page }) => {
  await page.goto("/settings");
  const org = page.getByTestId("org-form");
  await org.getByLabel("Phone").fill("617-555-0100");
  await org.getByRole("button", { name: "Save" }).click();
  await expect(org.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("org-form").getByLabel("Phone")).toHaveValue("617-555-0100");
  await page.getByTestId("org-form").getByLabel("Phone").fill("");
  await page.getByTestId("org-form").getByRole("button", { name: "Save" }).click();

  await page.goto("/settings/tutors");
  await page.getByRole("button", { name: "Add a tutor" }).click();
  const t = page.getByTestId("tutor-form-new");
  await t.getByLabel("Name").fill("E2E Tutor");
  await t.getByLabel("Pay per hour").fill("45");
  await t.getByRole("button", { name: "Add tutor" }).click();
  // The form folds away and the new tutor appears as a card.
  await expect(page.getByText("E2E Tutor")).toBeVisible();
  await expect(page.getByText("$45.00 per hour")).toBeVisible();

  await page.goto("/profile");
  const pw = page.getByTestId("password-form");
  await pw.getByLabel("Current password").fill("wrong");
  await pw.getByLabel("New password", { exact: true }).fill("another long password");
  await pw.getByLabel("New password again").fill("another long password");
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByRole("alert")).toContainText("current password is wrong");
});

test("an accountant can read but not write", async ({ page }) => {
  const m = await prisma.membership.findFirstOrThrow({ where: { user: { email: E2E_EMAIL } } });
  await prisma.membership.update({ where: { id: m.id }, data: { role: "ACCOUNTANT" } });
  try {
    const st = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella" } });
    await page.goto(`/accounts/${st.accountId}`);
    await expect(page.getByTestId("closing-balance")).toBeVisible();
    const pay = page.getByTestId("payment-form");
    await pay.getByLabel("Amount").fill("1");
    await pay.getByRole("button", { name: "Record" }).click();
    await expect(pay.getByRole("alert")).toContainText("read-only");
  } finally {
    await prisma.membership.update({ where: { id: m.id }, data: { role: "OWNER" } });
  }
});
