/** Adding and editing students, families, contacts, and progress notes through the screens. Cleans up. */
import { expect, test } from "@playwright/test";
import { prisma } from "../src/db";

const LAST = `Etest${Date.now()}`;

test.afterAll(async () => {
  const students = await prisma.student.findMany({ where: { lastName: LAST }, select: { id: true, accountId: true } });
  const accountIds = [...new Set(students.map((s) => s.accountId))];
  const extra = await prisma.account.findMany({ where: { name: { contains: LAST } }, select: { id: true } });
  const ids = [...new Set([...accountIds, ...extra.map((a) => a.id)])];
  await prisma.progressNote.deleteMany({ where: { studentId: { in: students.map((s) => s.id) } } });
  await prisma.student.deleteMany({ where: { lastName: LAST } });
  await prisma.guardian.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("add a student with a parent, edit, note, sibling, contact, and move", async ({ page }) => {
  page.on("dialog", (d) => d.accept());

  // Add from the students list.
  await page.goto("/students");
  await page.getByRole("link", { name: "Add student" }).click();
  const form = page.getByTestId("student-form");
  await form.getByLabel("First name").fill("Maya");
  await form.getByLabel("Last name").fill(LAST);
  await form.getByLabel("Grade").fill("8");
  await form.getByLabel("Usual subject").fill("Algebra 1");
  await form.getByLabel("Usual price").fill("120");
  await form.getByLabel("Account name").fill(`${LAST} family`);
  await form.getByLabel("Parent name").fill("Rosa Parent");
  await form.getByLabel("Parent email").fill("rosa@example.com");
  await form.getByRole("button", { name: "Add student" }).click();
  await expect(page.getByRole("heading", { name: `Maya ${LAST}` })).toBeVisible();
  await expect(page.getByText("Grade 8 · Algebra 1")).toBeVisible();
  await expect(page.getByText("Usual price $120.00")).toBeVisible();

  // Edit.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByTestId("student-form").getByLabel("School").fill("Oak Hill Middle");
  await page.getByTestId("student-form").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Grade 8 · Oak Hill Middle · Algebra 1")).toBeVisible();

  // Progress note: add, then edit.
  const noteForm = page.getByTestId("note-form");
  await noteForm.getByLabel("Note").fill("Stopped at linear equations, problem 12");
  await noteForm.getByRole("button", { name: "Add note" }).click();
  const notes = page.getByTestId("progress-notes");
  await expect(notes).toContainText("Stopped at linear equations, problem 12");
  await expect(noteForm.getByLabel("Note")).toHaveValue("");
  await notes.locator("summary").first().click();
  const edit = notes.locator("form").first();
  await edit.getByLabel("Note").fill("Stopped at problem 14");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(notes).toContainText("Stopped at problem 14");

  // Sibling into the same family.
  await page.goto("/students/new");
  const sib = page.getByTestId("student-form");
  await sib.getByLabel("First name").fill("Leo");
  await sib.getByLabel("Last name").fill(LAST);
  await sib.getByLabel("Add to an existing family").check();
  await sib.locator('select[name="accountId"]').selectOption({ label: `${LAST} family` });
  await sib.getByRole("button", { name: "Add student" }).click();
  await expect(page.getByRole("heading", { name: `Leo ${LAST}` })).toBeVisible();
  const maya = await prisma.student.findFirstOrThrow({ where: { firstName: "Maya", lastName: LAST } });
  const leo = await prisma.student.findFirstOrThrow({ where: { firstName: "Leo", lastName: LAST } });
  expect(leo.accountId).toBe(maya.accountId);

  // Account page: both students, the parent, add a second contact, rename.
  await page.goto(`/accounts/${maya.accountId}`);
  const guardians = page.getByTestId("guardians");
  await expect(guardians).toContainText("Rosa Parent");
  await expect(guardians).toContainText("main");
  await page.getByText("Add a contact", { exact: true }).click();
  const add = page.getByTestId("guardian-form-new");
  await add.getByLabel("Name", { exact: true }).fill("Sam Grandparent");
  await add.getByLabel("Phone").fill("555-0199");
  await add.getByLabel("Emergency contact").check();
  await add.getByRole("button", { name: "Add contact" }).click();
  await expect(guardians).toContainText("Sam Grandparent");
  await expect(guardians).toContainText("emergency");
  const acct = page.getByTestId("account-form");
  await acct.getByLabel("Account name").fill(`${LAST} household`);
  await acct.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: `${LAST} household` })).toBeVisible();

  // Move Leo to an account of his own.
  await page.goto(`/students/${leo.id}/edit`);
  const move = page.getByTestId("move-form");
  await expect(move).toContainText("Other students share it");
  await move.getByLabel("Move to").selectOption("new");
  await move.getByLabel("New account name").fill(`${LAST} Leo`);
  await move.getByRole("button", { name: "Move student" }).click();
  await expect(page).toHaveURL(new RegExp(`/students/${leo.id}$`));
  const moved = await prisma.student.findUniqueOrThrow({ where: { id: leo.id }, include: { account: true } });
  expect(moved.account.name).toBe(`${LAST} Leo`);
});
