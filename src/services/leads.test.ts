/** The pipeline. Uses a throwaway school. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { LeadError, createLead, enrollLead, leadCounts, listLeads, setLeadStatus, updateLead } from "./leads";

let orgId: string;
beforeAll(async () => { orgId = (await prisma.organization.create({ data: { name: "Lead Test School", slug: `leadtest-${Date.now()}` } })).id; });
afterAll(async () => {
  const accounts = await prisma.account.findMany({ where: { organizationId: orgId }, select: { id: true } });
  await prisma.student.deleteMany({ where: { organizationId: orgId } });
  await prisma.guardian.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.account.deleteMany({ where: { organizationId: orgId } });
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("leads", () => {
  it("moves through the stages and needs a reason to be lost", async () => {
    await expect(createLead(prisma, orgId, { studentFirstName: "", studentLastName: "X", parentName: "P" })).rejects.toThrow(LeadError);
    const lead = await createLead(prisma, orgId, { studentFirstName: "Nick", studentLastName: "K", parentName: "Olga K", parentEmail: "OLGA@example.com", subjects: "Algebra II", source: "referral" });
    expect(lead.parentEmail).toBe("olga@example.com");
    await setLeadStatus(prisma, orgId, lead.id, "CONSULT_BOOKED", { consultAt: new Date("2026-09-20T18:00:00Z") });
    await expect(setLeadStatus(prisma, orgId, lead.id, "LOST")).rejects.toThrow(/why/);
    await expect(setLeadStatus(prisma, orgId, lead.id, "ENROLLED")).rejects.toThrow(/enrol/);
    expect((await listLeads(prisma, orgId)).map((l) => l.id)).toContain(lead.id);
    await setLeadStatus(prisma, orgId, lead.id, "LOST", { lostReason: "Too far to drive" });
    expect((await listLeads(prisma, orgId)).map((l) => l.id)).not.toContain(lead.id);
    expect((await listLeads(prisma, orgId, { includeClosed: true }))[0].lostReason).toBe("Too far to drive");
    expect(await leadCounts(prisma, orgId)).toMatchObject({ LOST: 1 });
  });

  it("enrols into a student on a new or an existing account", async () => {
    const a = await createLead(prisma, orgId, { studentFirstName: "Ana", studentLastName: "M", parentName: "Rita M", parentEmail: "rita@example.com", goals: "Pass the SAT" });
    await updateLead(prisma, orgId, a.id, { studentFirstName: "Ana", studentLastName: "Marquez", parentName: "Rita Marquez", parentEmail: "rita@example.com", goals: "Pass the SAT", grade: "11" });
    const st = await enrollLead(prisma, orgId, a.id);
    expect(st).toMatchObject({ firstName: "Ana", lastName: "Marquez", grade: "11" });
    expect(st.notes).toContain("Goals: Pass the SAT");
    await expect(enrollLead(prisma, orgId, a.id)).rejects.toThrow(/Already/);
    const b = await createLead(prisma, orgId, { studentFirstName: "Ben", studentLastName: "Marquez", parentName: "Rita Marquez" });
    const sibling = await enrollLead(prisma, orgId, b.id, { accountId: st.accountId });
    expect(sibling.accountId).toBe(st.accountId);
    expect(await leadCounts(prisma, orgId)).toMatchObject({ ENROLLED: 2 });
  });
});
