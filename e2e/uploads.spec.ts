/** Real-size uploads: a big logo is refused with a clear message, and files over 1 MB go through. Cleans up. */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";

const MB = 1024 * 1024;
const bytes = (n: number) => Buffer.alloc(n, 7);
const NAME = `e2e-big-${Date.now()}.pdf`;

test.afterAll(async () => {
  const a = await prisma.assignment.findMany({ where: { title: NAME } });
  await prisma.assignmentFile.deleteMany({ where: { assignmentId: { in: a.map((x) => x.id) } } });
  await prisma.assignment.deleteMany({ where: { id: { in: a.map((x) => x.id) } } });
  await prisma.file.deleteMany({ where: { name: NAME } });
  await prisma.$disconnect();
});

test("a logo over 2 MB gets a message and nothing is sent", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  const card = page.getByTestId("logo-card");
  let posted = false;
  page.on("request", (r) => { if (r.method() === "POST") posted = true; });
  await card.getByLabel("Logo image").setInputFiles({ name: "huge-logo.png", mimeType: "image/png", buffer: bytes(3 * MB) });
  await expect(card.getByRole("alert")).toContainText("huge-logo.png is 3.0 MB, and the limit is 2.0 MB");
  await card.getByRole("button", { name: /Upload|Replace/ }).click();
  await expect(card.getByRole("alert")).toBeVisible();
  expect(posted).toBe(false);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

test("a 5 MB file uploads with a new assignment", async ({ page }) => {
  await page.goto("/homework/new");
  const form = page.getByTestId("assignment-form");
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), bytes(5 * MB)]);
  await form.getByLabel("Student").selectOption({ label: "Estella Urman" });
  await form.getByLabel("Title").fill(NAME);
  await form.getByLabel(/Files from your computer/).setInputFiles({ name: NAME, mimeType: "application/pdf", buffer: pdf });
  await form.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  await expect(page.getByTestId("assignment-files")).toContainText(NAME);
});

test("a 30 MB file is stopped in the browser", async ({ page }) => {
  await page.goto("/homework/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Files from your computer/).setInputFiles({ name: "too-big.pdf", mimeType: "application/pdf", buffer: bytes(26 * MB) });
  await expect(page.getByTestId("assignment-form").getByRole("alert")).toContainText("the limit is 25.0 MB");
});
