/** The family sign-up link. Uses a throwaway school. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { IntakeError, disableIntake, enableIntake, schoolForIntake, submitIntake } from "./intake";

const slug = `intaketest-${Date.now()}`;
let orgId: string;

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { name: "Intake Test School", slug } })).id;
});
afterAll(async () => {
  const accounts = await prisma.account.findMany({ where: { organizationId: orgId }, select: { id: true } });
  await prisma.student.deleteMany({ where: { organizationId: orgId } });
  await prisma.guardian.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.account.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

const form = { studentFirstName: "Mia", studentLastName: "Lopez", grade: "9", subjects: "Geometry", goals: "Catch up before finals", parentName: "Ana Lopez", parentEmail: "ana@example.com", parentPhone: "555-0101", consent: true };

describe("family sign-up", () => {
  it("does nothing until turned on, then creates the student, family, and parent", async () => {
    await expect(submitIntake(prisma, "nope", form)).rejects.toThrow(IntakeError);
    const org = await enableIntake(prisma, orgId);
    expect(org.intakeCode).toHaveLength(20);
    expect((await schoolForIntake(prisma, org.intakeCode!))?.name).toBe("Intake Test School");

    await expect(submitIntake(prisma, org.intakeCode!, { ...form, consent: false })).rejects.toThrow(/agree/);
    await expect(submitIntake(prisma, org.intakeCode!, { ...form, parentEmail: "nope" })).rejects.toThrow(/parent email/);
    const st = await submitIntake(prisma, org.intakeCode!, form, new Date("2026-09-14T15:00:00Z"));
    const full = await prisma.student.findUniqueOrThrow({ where: { id: st.id }, include: { account: { include: { guardians: true } } } });
    expect(full.account.name).toBe("Mia Lopez");
    expect(full.defaultSubject).toBe("Geometry");
    expect(full.notes).toContain("Signed up through the family form on 2026-09-14");
    expect(full.notes).toContain("Goals: Catch up before finals");
    expect(full.account.guardians[0]).toMatchObject({ name: "Ana Lopez", email: "ana@example.com", isPrimary: true });
  });

  it("a new link retires the old one; turning off stops both", async () => {
    const before = (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).intakeCode!;
    expect((await enableIntake(prisma, orgId)).intakeCode).toBe(before);
    const after = (await enableIntake(prisma, orgId, true)).intakeCode!;
    expect(after).not.toBe(before);
    expect(await schoolForIntake(prisma, before)).toBeNull();
    await disableIntake(prisma, orgId);
    expect(await schoolForIntake(prisma, after)).toBeNull();
  });
});
