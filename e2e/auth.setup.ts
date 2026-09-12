/**
 * Runs once before the browser tests: makes sure a local test user exists,
 * signs in through the real form, and saves the cookie for the other specs.
 * The user is local only; the import never creates it and verify never counts users.
 */
import { expect, test as setup } from "@playwright/test";
import { prisma } from "../src/db";
import { hashPassword } from "../src/auth/password";
import { E2E_EMAIL, E2E_PASSWORD } from "./credentials";

setup("sign in as the test user", async ({ page }) => {
  const org = await prisma.organization.findFirstOrThrow();
  const user = await prisma.user.upsert({
    where: { email: E2E_EMAIL },
    update: { passwordHash: await hashPassword(E2E_PASSWORD), deletedAt: null },
    create: { email: E2E_EMAIL, name: "E2E Tester", passwordHash: await hashPassword(E2E_PASSWORD), emailVerifiedAt: new Date() },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });
  await prisma.$disconnect();

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Easy STEM School" })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
