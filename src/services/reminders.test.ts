/** Lesson reminders, the day's schedule, and balance reminders, with a fake mail transport. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { setTransport } from "../email/send";
import { createLesson } from "./lessons";
import { createStudent } from "./people";
import { balanceReminders, dailySchedule, lessonReminders, nightlyEmails, sendBalanceReminders, sendDailySchedule, sendLessonReminders } from "./reminders";

const TAG = `Remindtest${Date.now()}`;
const DAY = "2031-01-15";
let orgId: string;
let accountId: string;
const outbox: { to: string; subject: string; text: string; files: string[] }[] = [];

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } })).id;
  setTransport(async (m) => {
    outbox.push({ to: m.to, subject: m.subject, text: m.text, files: m.attachments?.map((a) => a.filename) ?? [] });
    return { providerMessageId: `test-${outbox.length}` };
  });
  const a = await createStudent(prisma, orgId, { firstName: "Ivy", lastName: TAG }, { accountName: `${TAG} family`, guardian: { name: "Nora Parent", email: "nora@example.com" } });
  accountId = a.accountId;
  const b = await createStudent(prisma, orgId, { firstName: "Max", lastName: TAG }, { accountId });
  await createLesson(prisma, { studentId: a.id, startsAt: new Date(`${DAY}T21:00:00Z`), durationMin: 60, subject: "Algebra", priceCents: 12000, meetingLink: "https://zoom.us/j/1", locationType: "REMOTE" });
  await createLesson(prisma, { studentId: b.id, startsAt: new Date(`${DAY}T22:30:00Z`), durationMin: 45, subject: "Chemistry", priceCents: 9000 });
});

afterAll(async () => {
  setTransport(null);
  const students = await prisma.student.findMany({ where: { lastName: TAG }, select: { id: true } });
  const seats = await prisma.lessonStudent.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { lessonId: true } });
  const lessonIds = seats.map((s) => s.lessonId);
  await prisma.message.deleteMany({ where: { OR: [{ relatedId: { in: [...lessonIds, accountId, DAY] } }, { toEmail: "nora@example.com" }] } });
  await prisma.allocation.deleteMany({ where: { charge: { accountId } } });
  await prisma.charge.deleteMany({ where: { accountId } });
  await prisma.lessonStudent.deleteMany({ where: { lessonId: { in: lessonIds } } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
  await prisma.student.deleteMany({ where: { lastName: TAG } });
  await prisma.guardian.deleteMany({ where: { accountId } });
  await prisma.account.deleteMany({ where: { id: accountId } });
});

describe("lesson reminders", () => {
  it("groups a family's lessons into one email to the main contact", async () => {
    const all = await lessonReminders(prisma, orgId, DAY);
    const mine = all.filter((r) => r.accountId === accountId);
    expect(mine).toHaveLength(1);
    expect(mine[0].to).toBe("nora@example.com");
    expect(mine[0].lessons.map((l) => l.studentName)).toEqual(["Ivy", "Max"]);
    expect(mine[0].subject).toContain("Ivy and Max's lessons Wednesday, January 15");
    expect(mine[0].text).toContain("4:00 PM, Ivy · Algebra · 60 min · Online");
    expect(mine[0].text).toContain("Join: https://zoom.us/j/1");
  });

  it("sends once, and a second run skips it", async () => {
    const first = await sendLessonReminders(prisma, orgId, DAY, { accountIds: [accountId] });
    expect(first).toMatchObject({ sent: 1, failed: 0 });
    expect(outbox.filter((m) => m.to === "nora@example.com")).toHaveLength(1);
    const second = await sendLessonReminders(prisma, orgId, DAY, { accountIds: [accountId] });
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
    expect((await lessonReminders(prisma, orgId, DAY)).find((r) => r.accountId === accountId)?.alreadySent).toBe(2);
  });
});

describe("daily schedule", () => {
  it("lists the day and is sent once per address", async () => {
    const s = await dailySchedule(prisma, orgId, DAY);
    expect(s.count).toBeGreaterThanOrEqual(2);
    expect(s.text).toContain(`Ivy ${TAG} · Algebra · 60 min · online`);
    expect(await sendDailySchedule(prisma, orgId, DAY, "Owner@Example.com")).toEqual({ sent: true });
    expect(await sendDailySchedule(prisma, orgId, DAY, "owner@example.com")).toMatchObject({ sent: false });
    await prisma.message.deleteMany({ where: { kind: "DAILY_SCHEDULE", relatedId: DAY } });
  });
});

describe("balance reminders", () => {
  it("lists families who owe, and sends with the statement attached", async () => {
    const asOf = new Date("2031-01-20T00:00:00Z");
    const list = await balanceReminders(prisma, orgId, asOf);
    const mine = list.find((r) => r.accountId === accountId)!;
    expect(mine.balanceCents).toBe(21000);
    expect(mine.text).toContain("$210.00");
    const r = await sendBalanceReminders(prisma, orgId, [accountId], asOf);
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    const mail = outbox.at(-1)!;
    expect(mail.files[0]).toMatch(/^Statement - .+ family - 2031-01-01 to 2031-01-20\.pdf$/);
    expect((await balanceReminders(prisma, orgId, asOf)).find((x) => x.accountId === accountId)?.lastReminderAt).not.toBeNull();
  });
});

describe("nightly", () => {
  it("does nothing when a school has both switches off", async () => {
    expect(await nightlyEmails(prisma, orgId)).toEqual({});
  });
});
