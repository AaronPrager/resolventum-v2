/** The cancellation policy, no-shows, and make-up credits. Runs against the local database; cleans up. */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { rebuildAccountAllocations } from "./allocation";
import { accountBalances } from "./balances";
import { cancelLesson, cancellationOutcome, createLesson, issueMakeupCredit, markNoShow, restoreLesson } from "./lessons";

let studentId: string;
let accountId: string;
let orgId: string;
const created: string[] = [];
const policy = { lateCancelHours: 24, lateCancelChargePercent: 50, noShowChargePercent: 100, makeupOnLateCancel: false };

async function balance() {
  const rows = await accountBalances(prisma, orgId, new Date("2035-01-01T00:00:00Z"));
  return rows.find((r) => r.accountId === accountId)!.balanceCents;
}
async function setPolicy(p: Partial<typeof policy>) {
  await prisma.organization.update({ where: { id: orgId }, data: { ...policy, ...p } });
}

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  studentId = s.id;
  accountId = s.accountId;
  orgId = s.organizationId;
});

afterEach(async () => {
  await setPolicy({ lateCancelHours: 24, lateCancelChargePercent: 100, noShowChargePercent: 100, makeupOnLateCancel: false });
  for (const id of created.splice(0)) {
    await prisma.charge.deleteMany({ where: { OR: [{ lessonStudent: { lessonId: id } }, { sourceLessonId: id }] } });
    await prisma.lesson.delete({ where: { id } }).catch(() => undefined);
  }
  await rebuildAccountAllocations(prisma, accountId);
});

const lesson = (iso: string) => createLesson(prisma, { studentId, startsAt: new Date(iso), durationMin: 60, subject: "Policy test", priceCents: 10000 });

describe("cancellation policy", () => {
  it("knows early from late", () => {
    const start = new Date("2034-03-10T20:00:00Z");
    expect(cancellationOutcome(policy, start, new Date("2034-03-08T20:00:00Z"))).toMatchObject({ late: false, chargePercent: 0 });
    expect(cancellationOutcome(policy, start, new Date("2034-03-10T08:00:00Z"))).toMatchObject({ late: true, chargePercent: 50 });
  });

  it("an early cancellation releases the charge", async () => {
    await setPolicy({ lateCancelChargePercent: 100 });
    const before = await balance();
    const l = await lesson("2034-03-10T20:00:00Z");
    created.push(l.id);
    const r = await cancelLesson(prisma, l.id, "Family trip", { now: new Date("2034-03-01T00:00:00Z") });
    expect(r).toMatchObject({ late: false, chargePercent: 0, makeupCredits: 0 });
    expect(await balance()).toBe(before);
    const c = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: l.id } } });
    expect(c.voidReason).toBe("Family trip");
  });

  it("a late cancellation is charged the policy's share, and restoring puts the full price back", async () => {
    await setPolicy({ lateCancelChargePercent: 50 });
    const before = await balance();
    const l = await lesson("2034-03-10T20:00:00Z");
    created.push(l.id);
    const r = await cancelLesson(prisma, l.id, "", { now: new Date("2034-03-10T10:00:00Z") });
    expect(r).toMatchObject({ late: true, chargePercent: 50 });
    expect(await balance()).toBe(before + 5000);
    const c = await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: l.id } } });
    expect(c.voidedAt).toBeNull();
    expect(c.description).toBe("Policy test, 60 min (late cancellation, 50%)");

    await restoreLesson(prisma, l.id);
    expect(await balance()).toBe(before + 10000);
    expect((await prisma.charge.findFirstOrThrow({ where: { lessonStudent: { lessonId: l.id } } })).description).toBe("Policy test, 60 min");
  });

  it("the person can override the policy either way", async () => {
    await setPolicy({ lateCancelChargePercent: 100 });
    const before = await balance();
    const a = await lesson("2034-03-10T20:00:00Z");
    created.push(a.id);
    await cancelLesson(prisma, a.id, "Waived", { chargeAnyway: false, now: new Date("2034-03-10T19:00:00Z") });
    expect(await balance()).toBe(before);
    const b = await lesson("2034-03-17T20:00:00Z");
    created.push(b.id);
    await cancelLesson(prisma, b.id, "Late, charged", { chargeAnyway: true, now: new Date("2034-03-01T00:00:00Z") });
    expect(await balance()).toBe(before + 10000);
    await expect(cancelLesson(prisma, b.id, "", { chargePercent: 150 })).rejects.toThrow(/0 to 100/);
  });

  it("a make-up credit is issued automatically when the policy says so, and voided if the lesson comes back", async () => {
    await setPolicy({ lateCancelChargePercent: 100, makeupOnLateCancel: true });
    const before = await balance();
    const l = await lesson("2034-03-10T20:00:00Z");
    created.push(l.id);
    const r = await cancelLesson(prisma, l.id, "", { now: new Date("2034-03-10T10:00:00Z") });
    expect(r.makeupCredits).toBe(1);
    // Charged in full, credited in full: the family owes nothing more, and the credit names the lesson.
    expect(await balance()).toBe(before);
    const credit = await prisma.charge.findFirstOrThrow({ where: { sourceLessonId: l.id } });
    expect(credit).toMatchObject({ kind: "ADJUSTMENT", amountCents: -10000, studentId });
    expect(credit.description).toContain("Make-up credit, late cancellation: Policy test on 2034-03-10");
    expect(await issueMakeupCredit(prisma, l.id)).toBe(0); // only one per student per lesson

    await restoreLesson(prisma, l.id);
    expect((await prisma.charge.findUniqueOrThrow({ where: { id: credit.id } })).voidReason).toBe("Lesson restored");
    expect(await balance()).toBe(before + 10000);
  });
});

describe("no-show", () => {
  it("keeps the charge per the no-show policy and can be credited by hand", async () => {
    await setPolicy({ noShowChargePercent: 100 });
    const before = await balance();
    const l = await lesson("2034-03-10T20:00:00Z");
    created.push(l.id);
    expect(await markNoShow(prisma, l.id)).toEqual({ chargePercent: 100 });
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("NO_SHOW");
    expect(await balance()).toBe(before + 10000);
    expect(await issueMakeupCredit(prisma, l.id, { reason: "Goodwill" })).toBe(1);
    expect(await balance()).toBe(before);
  });

  it("a scheduled lesson cannot get a make-up credit", async () => {
    const l = await lesson("2034-03-10T20:00:00Z");
    created.push(l.id);
    await expect(issueMakeupCredit(prisma, l.id)).rejects.toThrow(/cancelled or missed/);
  });
});
