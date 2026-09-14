/** Session notes and sharing them with the family, with a fake mail transport. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { setTransport } from "../email/send";
import { createLesson } from "./lessons";
import { createStudent } from "./people";
import { SessionNoteError, lessonsMissingNotes, saveSessionNote, sessionNoteEmail, sessionNotesForStudent, shareSessionNote, shareUnsharedNotes } from "./sessionNotes";

const TAG = `Notetest${Date.now()}`;
let orgId: string;
let accountId: string;
let studentId: string;
let lessonId: string;
const outbox: { to: string; subject: string; text: string }[] = [];

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } })).id;
  setTransport(async (m) => { outbox.push({ to: m.to, subject: m.subject, text: m.text }); return { providerMessageId: `t-${outbox.length}` }; });
  const s = await createStudent(prisma, orgId, { firstName: "Leo", lastName: TAG }, { accountName: `${TAG} family`, guardian: { name: "Dana Parent", email: "dana@example.com" } });
  studentId = s.id;
  accountId = s.accountId;
  lessonId = (await createLesson(prisma, { studentId, startsAt: new Date("2026-09-10T20:00:00Z"), durationMin: 60, subject: "Algebra", priceCents: 12000 })).id;
});

afterAll(async () => {
  setTransport(null);
  await prisma.message.deleteMany({ where: { toEmail: { in: ["dana@example.com", "other@example.com"] } } });
  await prisma.sessionNote.deleteMany({ where: { studentId } });
  await prisma.allocation.deleteMany({ where: { charge: { accountId } } });
  await prisma.charge.deleteMany({ where: { accountId } });
  await prisma.lessonStudent.deleteMany({ where: { studentId } });
  await prisma.lesson.deleteMany({ where: { id: lessonId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.guardian.deleteMany({ where: { accountId } });
  await prisma.account.deleteMany({ where: { id: accountId } });
});

describe("session notes", () => {
  it("a completed lesson with no note shows up as missing", async () => {
    const missing = await lessonsMissingNotes(prisma, orgId, { from: "2026-09-10", to: "2026-09-11", timeZone: "America/New_York" });
    expect(missing.find((l) => l.lessonId === lessonId)?.students.map((s) => s.id)).toEqual([studentId]);
  });

  it("saves one note per student per lesson and checks the input", async () => {
    await expect(saveSessionNote(prisma, orgId, { lessonId, studentId, covered: " " })).rejects.toThrow(/covered/);
    await expect(saveSessionNote(prisma, orgId, { lessonId, studentId, covered: "x", engagement: 9 })).rejects.toThrow(/1 to 5/);
    await expect(saveSessionNote(prisma, orgId, { lessonId, studentId: "nope", covered: "x" })).rejects.toThrow(SessionNoteError);
    const n = await saveSessionNote(prisma, orgId, { lessonId, studentId, covered: "Quadratics, factoring", homework: "p. 42, 1 to 10", engagement: 4, win: "Factored a trinomial alone", struggle: "Negative signs", nextGoal: "Complete the square" });
    expect(n.engagement).toBe(4);
    const again = await saveSessionNote(prisma, orgId, { lessonId, studentId, covered: "Quadratics, factoring, and vertex form", engagement: 4 });
    expect(again.id).toBe(n.id);
    expect(again.homework).toBeNull();
    expect((await sessionNotesForStudent(prisma, studentId)).map((x) => x.covered)).toEqual(["Quadratics, factoring, and vertex form"]);
    expect((await lessonsMissingNotes(prisma, orgId, { from: "2026-09-10", to: "2026-09-11", timeZone: "America/New_York" })).some((l) => l.lessonId === lessonId)).toBe(false);
  });

  it("writes the parent's email without money in it", () => {
    const m = sessionNoteEmail({ orgName: "Easy STEM", timeZone: "America/New_York", parentFirst: "Dana", note: {
      covered: "Quadratics", homework: "p. 42", engagement: 5, win: "Got it", struggle: "Signs", nextGoal: "Vertex form",
      lesson: { startsAt: new Date("2026-09-10T20:00:00Z"), subject: "Algebra", durationMin: 60, tutor: { name: "Yakov" } }, student: { firstName: "Leo" },
    } });
    expect(m.subject).toBe("Easy STEM: Leo's Algebra lesson, Sep 10, 2026");
    expect(m.text).toContain("Hello Dana,");
    expect(m.text).toContain("with Yakov");
    expect(m.text).toContain("Engagement: fully engaged");
    expect(m.text).toContain("Next time: Vertex form");
    expect(m.text).not.toMatch(/\$/);
  });

  it("shares to the main contact and marks it shared; a rewrite goes out again", async () => {
    const n = await prisma.sessionNote.findFirstOrThrow({ where: { lessonId, studentId } });
    const shared = await shareSessionNote(prisma, orgId, n.id);
    expect(shared.sharedTo).toBe("dana@example.com");
    expect(outbox.at(-1)?.to).toBe("dana@example.com");
    expect(outbox.at(-1)?.text).toContain("What we covered: Quadratics, factoring, and vertex form");
    await shareSessionNote(prisma, orgId, n.id, { to: "other@example.com" });
    expect(outbox.at(-1)?.to).toBe("other@example.com");
    await saveSessionNote(prisma, orgId, { lessonId, studentId, covered: "Rewritten" });
    expect((await prisma.sessionNote.findUniqueOrThrow({ where: { id: n.id } })).sharedAt).toBeNull();
  });

  it("the nightly run shares what is unshared and honours the family's preference", async () => {
    await prisma.account.update({ where: { id: accountId }, data: { emailNotes: false } });
    expect(await shareUnsharedNotes(prisma, orgId, "2026-09-10")).toMatchObject({ sent: 0, skipped: 1 });
    await prisma.account.update({ where: { id: accountId }, data: { emailNotes: true } });
    const r = await shareUnsharedNotes(prisma, orgId, "2026-09-10");
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    expect(outbox.at(-1)?.text).toContain("What we covered: Rewritten");
    expect(await shareUnsharedNotes(prisma, orgId, "2026-09-10")).toMatchObject({ sent: 0 });
  });
});
