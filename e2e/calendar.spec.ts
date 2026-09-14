/**
 * Calendar week view and a weekly series made through the form. Cleans up after itself.
 */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";
import { rebuildAccountAllocations } from "../src/services/allocation";

test.beforeEach(({ page }) => { page.on("dialog", (d) => d.accept()); });

const SUBJECT = `E2E series ${Date.now()}`;

test.afterAll(async () => {
  const series = await prisma.lessonSeries.findMany({ where: { lessons: { some: { subject: SUBJECT } } } });
  for (const s of series) {
    await prisma.charge.deleteMany({ where: { lessonStudent: { lesson: { seriesId: s.id } } } });
    await prisma.lesson.deleteMany({ where: { seriesId: s.id } });
    await prisma.lessonSeries.delete({ where: { id: s.id } });
  }
  const st = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  await rebuildAccountAllocations(prisma, st.accountId);
  await prisma.$disconnect();
});

test("the week view shows imported lessons at New York times", async ({ page }) => {
  await page.goto("/calendar?week=2026-09-14");
  await expect(page.getByRole("heading", { name: "Week of Sep 14" })).toBeVisible();
  const monday = page.locator('[data-day="2026-09-14"]');
  await expect(monday.getByRole("button", { name: /^Victoria Li, Sep 14 at 2:45 PM$/ })).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Week of Sep 21" })).toBeVisible();
});

test("a weekly series from the calendar creates four lessons and can be cut short", async ({ page }) => {
  await page.goto("/calendar?week=2027-11-01");
  await page.locator('[data-day="2027-11-02"]').getByRole("link", { name: "New lesson on 2027-11-02" }).click();
  await expect(page.getByRole("heading", { name: "New lesson" })).toBeVisible();
  const form = page.getByTestId("lesson-form");
  await form.getByLabel("Student").selectOption({ label: "Urman, Estella" });
  await form.getByLabel("Time").fill("16:00");
  await form.getByLabel("Minutes").fill("60");
  await form.getByLabel("Price").fill("130");
  await form.getByLabel("Subject").fill(SUBJECT);
  await form.getByLabel("Repeat every").check();
  await form.getByLabel("until").fill("2027-11-23");
  await form.getByRole("button", { name: "Add lesson" }).click();

  // Back on the calendar week, the first one is there at 4 pm, and the DST switch on Nov 7 does not move the time.
  await expect(page.getByRole("heading", { name: "Week of Nov 1" })).toBeVisible();
  await expect(page.locator('[data-day="2027-11-02"]').getByRole("button", { name: new RegExp(`${SUBJECT}, Nov 2 at 4:00 PM`) })).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.locator('[data-day="2027-11-09"]').getByRole("button", { name: new RegExp(`${SUBJECT}, Nov 9 at 4:00 PM`) })).toBeVisible();
  const lessons = await prisma.lesson.findMany({ where: { subject: SUBJECT }, orderBy: { startsAt: "asc" } });
  expect(lessons.length).toBe(4);
  expect(lessons.map((l) => l.startsAt.toISOString())).toEqual([
    "2027-11-02T20:00:00.000Z", "2027-11-09T21:00:00.000Z", "2027-11-16T21:00:00.000Z", "2027-11-23T21:00:00.000Z",
  ]);

  // Cancel the third and everything after it.
  await page.goto(`/lessons/${lessons[2].id}`);
  await expect(page.getByText("Part of a weekly series.")).toBeVisible();
  const cancel = page.locator("form").filter({ has: page.getByLabel("Reason") });
  await cancel.getByLabel("Reason").fill("Stopping for the holidays");
  await cancel.getByLabel("This and all later lessons in the series").check();
  await cancel.getByRole("button", { name: "Cancel lesson" }).click();
  await expect(page.getByRole("heading", { name: "Estella Urman" })).toBeVisible();
  const after = await prisma.lesson.findMany({ where: { subject: SUBJECT }, orderBy: { startsAt: "asc" }, include: { students: { include: { charge: true } } } });
  expect(after.map((l) => l.status)).toEqual(["SCHEDULED", "SCHEDULED", "CANCELLED", "CANCELLED"]);
  expect(after[3].students[0].charge?.voidReason).toBe("Stopping for the holidays");
});

test("click selects an event, double-click opens it, Delete removes it after asking", async ({ page }) => {
  const title = `E2E delete ${Date.now()}`;
  const org = await prisma.organization.findFirstOrThrow();
  const { createSeries } = await import("../src/services/series");
  await createSeries(prisma, { organizationId: org.id, startsAt: new Date("2028-02-07T19:00:00Z"), durationMin: 60, subject: title, priceCents: 0, until: "2028-02-21" });
  await page.goto("/calendar?week=2028-02-07");
  const chip = page.getByRole("button", { name: new RegExp(`${title}, Feb 7`) });

  // Double-click opens.
  await chip.dblclick();
  await expect(page.getByRole("heading", { name: "Edit event" })).toBeVisible();
  await page.goBack();

  // Click selects; Delete asks; Keep it leaves it alone.
  await chip.click();
  await expect(chip).toBeFocused();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(title);
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(dialog).toBeHidden();
  await expect(chip).toBeVisible();

  // Arrows move the selection: right to the next day with events, left back again, down to the next event.
  await page.goto("/calendar?month=2028-02");
  const feb7 = page.getByRole("button", { name: new RegExp(`${title}, Feb 7`) });
  const feb14 = page.getByRole("button", { name: new RegExp(`${title}, Feb 14`) });
  const feb21 = page.getByRole("button", { name: new RegExp(`${title}, Feb 21`) });
  await feb7.click();
  await expect(page).toHaveURL(/month=2028-02/); // one click only selects
  await expect(feb7).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(feb14).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(feb21).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(feb14).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(feb7).toBeFocused();
  await page.goto("/calendar?week=2028-02-07");

  // Backspace works too; "This and all later" takes the rest of the series with it.
  await chip.click();
  await page.keyboard.press("Backspace");
  await page.getByRole("alertdialog").getByRole("button", { name: "This and all later" }).click();
  await expect(chip).toBeHidden();
  const rows = await prisma.lesson.findMany({ where: { subject: title } });
  expect(rows.length).toBe(3);
  expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
  await prisma.lesson.deleteMany({ where: { subject: title } });
});
