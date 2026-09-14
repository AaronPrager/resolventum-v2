/** Students, families, contacts, and notes. Runs against the local database; cleans up what it makes. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createLesson } from "./lessons";
import { recordPayment } from "./payments";
import {
  PeopleError, addGuardian, addProgressNote, createStudent, deleteProgressNote, moveStudent, removeGuardian, updateAccount,
  updateGuardian, updateProgressNote, updateStudent,
} from "./people";

const TAG = `Peopletest${Date.now()}`;
let orgId: string;
const today = new Date("2026-09-13T00:00:00Z");

beforeAll(async () => {
  orgId = (await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } })).id;
});

afterAll(async () => {
  const accounts = await prisma.account.findMany({ where: { OR: [{ name: { contains: TAG } }, { students: { some: { lastName: TAG } } }] }, select: { id: true } });
  const ids = accounts.map((a) => a.id);
  const students = await prisma.student.findMany({ where: { lastName: TAG }, select: { id: true } });
  const seats = await prisma.lessonStudent.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { lessonId: true } });
  await prisma.allocation.deleteMany({ where: { OR: [{ charge: { accountId: { in: ids } } }, { payment: { accountId: { in: ids } } }] } });
  await prisma.charge.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.lessonStudent.deleteMany({ where: { studentId: { in: students.map((s) => s.id) } } });
  await prisma.lesson.deleteMany({ where: { id: { in: seats.map((s) => s.lessonId) } } });
  await prisma.progressNote.deleteMany({ where: { studentId: { in: students.map((s) => s.id) } } });
  await prisma.student.deleteMany({ where: { lastName: TAG } });
  await prisma.guardian.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: ids } } });
});

describe("students", () => {
  it("adds a student with a new family account and a parent, then a sibling to the same account", async () => {
    const a = await createStudent(prisma, orgId, { firstName: "Ann", lastName: TAG, grade: "7", defaultPriceCents: 12000, email: "ANN@Example.com" }, { accountName: `${TAG} family`, guardian: { name: "Pat Parent", email: "pat@example.com" } });
    expect(a.email).toBe("ann@example.com");
    const account = await prisma.account.findUniqueOrThrow({ where: { id: a.accountId }, include: { guardians: true } });
    expect(account.name).toBe(`${TAG} family`);
    expect(account.guardians).toHaveLength(1);
    expect(account.guardians[0].isPrimary && account.guardians[0].isBilling).toBe(true);

    const b = await createStudent(prisma, orgId, { firstName: "Ben", lastName: TAG }, { accountId: a.accountId });
    expect(b.accountId).toBe(a.accountId);

    const solo = await createStudent(prisma, orgId, { firstName: "Cal", lastName: TAG }, {});
    expect((await prisma.account.findUniqueOrThrow({ where: { id: solo.accountId } })).name).toBe(`Cal ${TAG}`);
  });

  it("edits a student and refuses bad input", async () => {
    const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Ann", lastName: TAG } });
    const u = await updateStudent(prisma, orgId, s.id, { firstName: "Anne", lastName: TAG, schoolName: " Oak Hill ", dateOfBirth: "2013-04-02", defaultPriceCents: null });
    expect(u.firstName).toBe("Anne");
    expect(u.schoolName).toBe("Oak Hill");
    expect(u.defaultPriceCents).toBeNull();
    expect(u.dateOfBirth?.toISOString().slice(0, 10)).toBe("2013-04-02");
    await expect(updateStudent(prisma, orgId, s.id, { firstName: "", lastName: TAG })).rejects.toThrow(/First name/);
    await expect(updateStudent(prisma, orgId, s.id, { firstName: "A", lastName: TAG, email: "nope" })).rejects.toThrow(/email/);
    await expect(updateStudent(prisma, "other-org", s.id, { firstName: "A", lastName: TAG })).rejects.toThrow(PeopleError);
  });
});

describe("moving a student between families", () => {
  it("a sibling leaving keeps past charges and payments with the family and takes future charges", async () => {
    const ben = await prisma.student.findFirstOrThrow({ where: { firstName: "Ben", lastName: TAG } });
    const familyId = ben.accountId;
    await createLesson(prisma, { studentId: ben.id, startsAt: new Date("2026-09-01T20:00:00Z"), durationMin: 60, subject: "Past", priceCents: 10000 });
    await createLesson(prisma, { studentId: ben.id, startsAt: new Date("2026-10-01T20:00:00Z"), durationMin: 60, subject: "Future", priceCents: 10000 });
    await recordPayment(prisma, { accountId: familyId, amountCents: 15000, paidOn: "2026-09-02", method: "ZELLE" });

    const r = await moveStudent(prisma, orgId, ben.id, { newAccountName: `${TAG} Ben` }, today);
    expect(r.mergedWholeAccount).toBe(false);
    expect(r.movedCharges).toBe(1);
    const past = await prisma.charge.findFirstOrThrow({ where: { studentId: ben.id, description: { startsWith: "Past" } } });
    const future = await prisma.charge.findFirstOrThrow({ where: { studentId: ben.id, description: { startsWith: "Future" } } });
    expect(past.accountId).toBe(familyId);
    expect(future.accountId).toBe(r.accountId);
    expect(await prisma.payment.count({ where: { accountId: familyId } })).toBe(1);
    // No allocation crosses accounts.
    const crossing = await prisma.allocation.count({ where: { charge: { accountId: r.accountId }, payment: { accountId: familyId } } });
    expect(crossing).toBe(0);
  });

  it("an only child joining a family brings the whole account, and the old one is archived", async () => {
    const ben = await prisma.student.findFirstOrThrow({ where: { firstName: "Ben", lastName: TAG } });
    const benAccount = ben.accountId;
    await addGuardian(prisma, orgId, benAccount, { name: "Ben's dad" });
    await recordPayment(prisma, { accountId: benAccount, amountCents: 5000, paidOn: "2026-09-05", method: "VENMO" });
    const family = await prisma.student.findFirstOrThrow({ where: { firstName: "Anne", lastName: TAG } });

    const r = await moveStudent(prisma, orgId, ben.id, { accountId: family.accountId }, today);
    expect(r.mergedWholeAccount).toBe(true);
    expect(await prisma.charge.count({ where: { accountId: benAccount } })).toBe(0);
    expect(await prisma.payment.count({ where: { accountId: benAccount } })).toBe(0);
    expect(await prisma.guardian.count({ where: { accountId: family.accountId } })).toBe(2);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: benAccount } })).archivedAt).not.toBeNull();
    await expect(moveStudent(prisma, orgId, ben.id, { accountId: family.accountId }, today)).rejects.toThrow(/already on that account/);
  });
});

describe("accounts and contacts", () => {
  it("renames, keeps one primary contact, and promotes someone when the primary is removed", async () => {
    const anne = await prisma.student.findFirstOrThrow({ where: { firstName: "Anne", lastName: TAG } });
    await updateAccount(prisma, orgId, anne.accountId, { name: `${TAG} renamed`, notes: "Pays monthly" });
    expect((await prisma.account.findUniqueOrThrow({ where: { id: anne.accountId } })).name).toBe(`${TAG} renamed`);

    const mom = await addGuardian(prisma, orgId, anne.accountId, { name: "Mom", email: "mom@example.com", isPrimary: true });
    const guardians = await prisma.guardian.findMany({ where: { accountId: anne.accountId } });
    expect(guardians.filter((g) => g.isPrimary).map((g) => g.id)).toEqual([mom.id]);

    await updateGuardian(prisma, orgId, mom.id, { name: "Mom", phone: "555-0100", isPrimary: true, isEmergency: true });
    expect((await prisma.guardian.findUniqueOrThrow({ where: { id: mom.id } })).isEmergency).toBe(true);
    await removeGuardian(prisma, orgId, mom.id);
    expect(await prisma.guardian.count({ where: { accountId: anne.accountId, isPrimary: true } })).toBe(1);
    await expect(addGuardian(prisma, orgId, anne.accountId, { name: " " })).rejects.toThrow(/name/);
  });
});

describe("progress notes", () => {
  it("adds, edits, and deletes", async () => {
    const anne = await prisma.student.findFirstOrThrow({ where: { firstName: "Anne", lastName: TAG } });
    const n = await addProgressNote(prisma, orgId, anne.id, { notedOn: "2026-09-10", note: "Stopped at problem 4" });
    await updateProgressNote(prisma, orgId, n.id, { notedOn: "2026-09-11", note: "Stopped at problem 6" });
    expect((await prisma.progressNote.findUniqueOrThrow({ where: { id: n.id } })).note).toBe("Stopped at problem 6");
    await expect(addProgressNote(prisma, orgId, anne.id, { notedOn: "2026-09-10", note: "  " })).rejects.toThrow(/note/);
    await expect(deleteProgressNote(prisma, "other-org", n.id)).rejects.toThrow(PeopleError);
    await deleteProgressNote(prisma, orgId, n.id);
    expect(await prisma.progressNote.count({ where: { id: n.id } })).toBe(0);
  });
});
