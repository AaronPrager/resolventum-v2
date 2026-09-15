/**
 * Homework end to end (tutor side and the public student page), expenses and
 * the tax summary, and reports. Cleans up what it makes.
 */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";

const TAG = `E2E ${Date.now()}`;

test.afterAll(async () => {
  const assignments = await prisma.assignment.findMany({ where: { title: { contains: TAG } } });
  for (const a of assignments) {
    await prisma.token.deleteMany({ where: { subjectId: a.id } });
    const subs = await prisma.submission.findMany({ where: { assignmentId: a.id } });
    await prisma.submission.deleteMany({ where: { assignmentId: a.id } });
    await prisma.file.deleteMany({ where: { id: { in: subs.map((s) => s.fileId).filter((x): x is string => !!x) } } });
    await prisma.assignment.delete({ where: { id: a.id } });
  }
  await prisma.file.deleteMany({ where: { name: { contains: "e2e-worksheet" } } });
  await prisma.expense.deleteMany({ where: { description: { contains: TAG } } });
  await prisma.vendor.deleteMany({ where: { name: { contains: "E2E Vendor" } } });
  await prisma.$disconnect();
});

test("homework: assignment with a file from the computer, student upload through the public link, feedback", async ({ page, browser }) => {
  await page.goto("/homework");
  await page.getByText("New assignment", { exact: true }).click();
  const form = page.getByTestId("assignment-form");
  await form.getByLabel("Student").selectOption({ label: "Estella Urman" });
  await form.getByLabel("Title").fill(`${TAG} worksheet`);
  await form.getByLabel("Due").fill("2027-02-01");
  await form.getByLabel(/Files from your computer/).setInputFiles({ name: "e2e-worksheet.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
  await form.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("heading", { name: `${TAG} worksheet` })).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Make a link|New link/ }).click();
  const link = (await page.getByTestId("upload-link").locator("code").textContent())!.trim();
  expect(link).toMatch(/\/h\/[A-Za-z0-9_-]+$/);

  // The student, with no session, sees the assignment and sends a photo.
  const student = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const sp = await student.newPage();
  await sp.goto(link);
  await expect(sp.getByRole("heading", { name: `${TAG} worksheet` })).toBeVisible();
  await expect(sp.getByRole("link", { name: "e2e-worksheet.pdf" })).toBeVisible();
  const dl = await sp.request.get(await sp.getByRole("link", { name: "e2e-worksheet.pdf" }).getAttribute("href") ?? "");
  expect(dl.status()).toBe(200);
  await sp.getByLabel(/PDF or photos/).setInputFiles({ name: "answers.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
  await sp.getByLabel(/A note for your tutor/).fill("Done!");
  await sp.getByRole("button", { name: "Send" }).click();
  await expect(sp.getByTestId("submit-form").getByRole("status")).toContainText("Sent 1 file");
  await expect(sp.getByText("What you sent")).toBeVisible();
  await student.close();

  // Back on the tutor side: the submission is there, to review, and feedback closes it.
  await page.reload();
  await expect(page.getByText("to review")).toBeVisible();
  await expect(page.getByRole("link", { name: "answers.png" })).toBeVisible();
  const fb = page.getByTestId("feedback-form");
  await fb.getByLabel("Your feedback").fill("Great work. Check problem 4 again.");
  await fb.getByLabel("Score (1 to 5)").selectOption("4");
  await fb.getByRole("button", { name: "Save feedback" }).click();
  await expect(page.getByText("Feedback · 4 of 5")).toBeVisible();
  await expect(page.getByText("reviewed")).toBeVisible();

  // The student page now shows the feedback and stops accepting uploads.
  const again = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const sp2 = await again.newPage();
  await sp2.goto(link);
  await expect(sp2.getByText("Great work. Check problem 4 again.")).toBeVisible();
  await expect(sp2.getByText("has been reviewed")).toBeVisible();
  await again.close();
});

test("expenses: add one, see it deductible, and in the tax summary", async ({ page }) => {
  await page.goto("/expenses/new?returnTo=%2Fexpenses%3Fmonth%3D2026-09");
  const form = page.getByTestId("expense-form");
  await form.getByLabel("Date").fill("2026-09-05");
  await form.getByLabel("Amount").fill("40");
  await form.getByLabel("Vendor").fill("E2E Vendor");
  await form.getByLabel("Description").fill(`${TAG} markers`);
  await form.getByLabel("Category").selectOption({ label: "Supplies" });
  await form.getByLabel("Tax treatment").selectOption("PARTIAL_USE");
  await form.getByLabel("Business %").fill("50");
  await form.getByRole("button", { name: "Record expense" }).click();
  await expect(page).toHaveURL(/\/expenses\?month=2026-09/); // recorded, back on the list
  const row = page.getByTestId("expenses").getByRole("row", { name: new RegExp(`${TAG} markers`) });
  await expect(row).toContainText("$40.00");
  await expect(row).toContainText("$20.00");

  await page.goto("/expenses/tax?year=2026");
  await expect(page.getByTestId("tax-lines")).toContainText("Supplies");
  const csv = await page.request.get("/api/tax-csv?year=2026");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(`${TAG} markers`);
});

test("reports show the year", async ({ page }) => {
  await page.goto("/reports?year=2025");
  await expect(page.getByRole("heading", { name: "Reports 2025" })).toBeVisible();
  await expect(page.getByTestId("received")).toContainText("$42,605.00");
  await expect(page.getByTestId("months")).toContainText("Dec");
  await expect(page.getByText("Students by revenue")).toBeVisible();
});

test("AI buttons explain themselves when no key is set", async ({ page }) => {
  const st = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella" } });
  await page.goto(`/students/${st.id}/update`);
  await expect(page.getByRole("button", { name: "Draft with AI" })).toBeDisabled();
  await expect(page.getByText("Set GEMINI_API_KEY on the server to turn this on.")).toBeVisible();
});
