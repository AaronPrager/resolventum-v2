/**
 * Adds a lesson through the form, checks the charge lands on the statement,
 * cancels it, and removes what it created so the imported data stays as it was.
 */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";
import { rebuildAccountAllocations } from "../src/services/allocation";

test.beforeEach(({ page }) => { page.on("dialog", (d) => d.accept()); });

const SUBJECT = `E2E lesson ${Date.now()}`;

test.afterAll(async () => {
  const lessons = await prisma.lesson.findMany({ where: { subject: SUBJECT }, include: { students: true } });
  for (const l of lessons) {
    await prisma.charge.deleteMany({ where: { lessonStudent: { lessonId: l.id } } });
    await prisma.lesson.delete({ where: { id: l.id } });
  }
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  await rebuildAccountAllocations(prisma, s.accountId);
  await prisma.$disconnect();
});

test("add, edit, and cancel a lesson", async ({ page }) => {
  const student = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  await page.goto(`/students/${student.id}`);
  await expect(page.getByRole("heading", { name: "Estella Urman" })).toBeVisible();
  await expect(page.getByText("credit $130.00")).toBeVisible();

  // Add a future lesson at 130.
  const form = page.getByTestId("lesson-form");
  await form.getByLabel("Date").fill("2027-03-20");
  await form.getByLabel("Time").fill("16:00");
  await form.getByLabel("Minutes").fill("60");
  await form.getByLabel("Price").fill("130");
  await form.getByLabel("Subject").fill(SUBJECT);
  await form.getByRole("button", { name: "Add lesson" }).click();

  const upcoming = page.getByTestId("upcoming");
  const row = upcoming.getByRole("row", { name: new RegExp(SUBJECT) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Sat, Mar 20, 2027, 4:00 PM");
  await expect(row).toContainText("$130.00");
  await expect(row).toContainText("scheduled");

  // The charge is on the statement, dated the lesson day, and the balance moved from credit 130 to zero.
  await page.goto(`/accounts/${student.accountId}`);
  const entry = page.getByTestId("statement").getByRole("row", { name: new RegExp(SUBJECT) });
  await expect(entry).toContainText("Mar 20, 2027");
  await expect(entry).toContainText("$130.00");
  await expect(page.getByTestId("closing-balance")).toContainText("$0.00");

  // Edit the price to 140.
  await page.goto(`/students/${student.id}`);
  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit lesson" })).toBeVisible();
  await page.getByLabel("Price").fill("140");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("$140.00");

  // Cancel it: the charge is voided and the credit is back.
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("cancelled");
  await expect(row).toContainText("not charged");
  await expect(page.getByText("credit $130.00")).toBeVisible();

  // Restore it. The student page shows today's balance, and this lesson is in 2027,
  // so the change shows on the statement, which has no cutoff.
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(row).toContainText("scheduled");
  await expect(row).not.toContainText("not charged");
  await page.goto(`/accounts/${student.accountId}`);
  await expect(page.getByTestId("closing-balance")).toContainText("owes $10.00");
});

test("the form rejects a bad price", async ({ page }) => {
  const student = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  await page.goto(`/students/${student.id}`);
  const form = page.getByTestId("lesson-form");
  await form.getByLabel("Subject").fill(SUBJECT);
  await form.getByLabel("Price").fill("abc");
  await form.getByRole("button", { name: "Add lesson" }).click();
  await expect(form.getByRole("alert")).toContainText("Price must be a number");
});
