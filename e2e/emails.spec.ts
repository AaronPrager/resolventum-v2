/** The Emails page with email switched off locally: previews show, sending is blocked, settings save. */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";

test.afterAll(async () => {
  await prisma.organization.updateMany({ where: { name: "Easy STEM School" }, data: { lessonRemindersAuto: false, dailyScheduleAuto: false, dailyScheduleEmail: null } });
  await prisma.$disconnect();
});

test("lesson reminders preview a family email, balance reminders list who owes, settings save", async ({ page }) => {
  await page.goto("/emails?tab=lessons&day=2026-09-14");
  await expect(page.getByText("Email is off on this server")).toBeVisible();
  const lessons = page.getByTestId("lesson-reminders");
  await expect(lessons).toContainText("Victoria Li");
  await lessons.locator("li", { hasText: "Victoria Li" }).getByText("Preview").click();
  await expect(lessons).toContainText("A reminder about Monday, September 14");
  await expect(lessons.getByRole("button", { name: /Send \d+ reminder/ })).toBeDisabled();

  await page.getByRole("link", { name: "Balance reminders" }).click();
  const balances = page.getByTestId("balance-reminders");
  await expect(balances).toContainText("Samuel Barbalat");
  await expect(balances).toContainText("$900.00");

  await page.getByRole("link", { name: "Daily schedule" }).click();
  const settings = page.getByTestId("email-settings");
  await settings.getByLabel("Every morning, email families about the next day's lessons").check();
  await settings.getByLabel("Send the schedule to").fill("owner@example.com");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.getByRole("status")).toHaveText("Saved");
  const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
  expect(org.lessonRemindersAuto).toBe(true);
  expect(org.dailyScheduleEmail).toBe("owner@example.com");

  await page.getByRole("link", { name: "Sent" }).click();
  await expect(page.getByText(/Last 100 emails/)).toBeVisible();
});
