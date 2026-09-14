/** Real-size uploads: a big logo is refused with a clear message, and files over 1 MB go through. Cleans up. */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";

const MB = 1024 * 1024;
const bytes = (n: number) => Buffer.alloc(n, 7);
const NAME = `e2e-big-${Date.now()}.pdf`;

test.afterAll(async () => {
  await prisma.libraryItem.deleteMany({ where: { file: { name: NAME } } });
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

test("a 5 MB library file uploads", async ({ page }) => {
  await page.goto("/library");
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), bytes(5 * MB)]);
  await page.getByLabel("Files").setInputFiles({ name: NAME, mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByTestId("upload-form").getByRole("status")).toHaveText("1 file added");
  await expect(page.getByTestId("library")).toContainText(NAME);
});

test("a 30 MB file is stopped in the browser", async ({ page }) => {
  await page.goto("/library");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Files").setInputFiles({ name: "too-big.pdf", mimeType: "application/pdf", buffer: bytes(26 * MB) });
  await expect(page.getByTestId("upload-form").getByRole("alert")).toContainText("the limit is 25.0 MB");
});
