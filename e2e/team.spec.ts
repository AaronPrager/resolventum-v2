/** An owner invites a tutor; the tutor follows the link signed out, makes an account, and lands in the school. */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";

const email = `e2e-invite-${Date.now()}@example.com`;

test.afterAll(async () => {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u) {
    await prisma.authSession.deleteMany({ where: { userId: u.id } });
    await prisma.membership.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  const inv = await prisma.invitation.findMany({ where: { email } });
  await prisma.token.deleteMany({ where: { subjectId: { in: inv.map((i) => i.id) } } });
  await prisma.invitation.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("invite a tutor and they join", async ({ page, browser }) => {
  await page.goto("/settings/team");
  const form = page.getByTestId("invite-form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Role").selectOption("TUTOR");
  await form.getByRole("button", { name: "Invite" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!.trim();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
  await expect(page.getByTestId("invitations")).toContainText(email);

  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await anon.newPage();
  await p.goto(link);
  await expect(p.getByRole("heading", { name: "Join Easy STEM School" })).toBeVisible();
  await p.getByLabel("Your name").fill("Invited Tutor");
  await p.getByLabel("Choose a password").fill("a good long password");
  await p.getByRole("button", { name: "Join" }).click();
  await expect(p).toHaveURL(/\/calendar/);
  await expect(p.getByText("Invited Tutor")).toBeVisible();
  await p.goto(link);
  await expect(p.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await anon.close();

  await page.reload();
  await expect(page.getByTestId("members")).toContainText(email);
});
