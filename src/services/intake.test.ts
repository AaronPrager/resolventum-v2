/** The family sign-up link. Uses a throwaway school. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { IntakeError, disableIntake, enableIntake, schoolForIntake, submitIntake } from "./intake";
import { enrollLead } from "./leads";

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
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

const form = { studentFirstName: "Mia", studentLastName: "Lopez", grade: "9", subjects: "Geometry", goals: "Catch up before finals", parentName: "Ana Lopez", parentEmail: "ana@example.com", parentPhone: "555-0101", consent: true };

describe("family sign-up", () => {
  it("does nothing until turned on, then puts an inquiry in the pipeline that enrols into a student, family, and parent", async () => {
    await expect(submitIntake(prisma, "nope", form)).rejects.toThrow(IntakeError);
    const org = await enableIntake(prisma, orgId);
    expect(org.intakeCode).toHaveLength(20);
    expect((await schoolForIntake(prisma, org.intakeCode!))?.name).toBe("Intake Test School");

    await expect(submitIntake(prisma, org.intakeCode!, { ...form, consent: false })).rejects.toThrow(/agree/);
    await expect(submitIntake(prisma, org.intakeCode!, { ...form, parentEmail: "nope" })).rejects.toThrow(/parent email/);
    const lead = await submitIntake(prisma, org.intakeCode!, form, new Date("2026-09-14T15:00:00Z"));
    expect(lead).toMatchObject({ status: "INQUIRY", source: "form", studentFirstName: "Mia", parentEmail: "ana@example.com", subjects: "Geometry", goals: "Catch up before finals" });
    expect(lead.notes).toContain("Signed up through the family form on 2026-09-14");
    expect(await prisma.student.count({ where: { organizationId: orgId } })).toBe(0);

    const st = await enrollLead(prisma, orgId, lead.id);
    const full = await prisma.student.findUniqueOrThrow({ where: { id: st.id }, include: { account: { include: { guardians: true } } } });
    expect(full.account.name).toBe("Mia Lopez");
    expect(full.defaultSubject).toBe("Geometry");
    expect(full.notes).toContain("Goals: Catch up before finals");
    expect(full.account.guardians[0]).toMatchObject({ name: "Ana Lopez", email: "ana@example.com", isPrimary: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("ENROLLED");
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
