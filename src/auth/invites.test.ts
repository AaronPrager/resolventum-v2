/** Staff invitations and team rules. Cleans up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { hashPassword } from "./password";
import { InviteError, acceptInvitation, cancelInvitation, changeRole, invitationForToken, inviteStaff, removeMember, teamFor } from "./invites";

const TAG = `invitetest${Date.now()}`;
const newEmail = `${TAG}-new@example.com`;
const oldEmail = `${TAG}-old@example.com`;
let orgId: string;
let ownerId: string;

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
  orgId = org.id;
  ownerId = (await prisma.membership.findFirstOrThrow({ where: { organizationId: orgId, role: "OWNER" } })).userId;
  // Someone who already uses Resolventum at another school.
  const other = await prisma.organization.create({ data: { name: `${TAG} other`, slug: `${TAG}-other` } });
  const u = await prisma.user.create({ data: { email: oldEmail, name: "Old User", passwordHash: await hashPassword("existing password") } });
  await prisma.membership.create({ data: { userId: u.id, organizationId: other.id, role: "OWNER" } });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
  await prisma.authSession.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.membership.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  const invs = await prisma.invitation.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
  await prisma.token.deleteMany({ where: { subjectId: { in: invs.map((i) => i.id) } } });
  await prisma.invitation.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.organization.deleteMany({ where: { slug: `${TAG}-other` } });
});

const tokenOf = (link: string) => link.split("/invite/")[1];

describe("invitations", () => {
  it("a new person accepts, gets an account and the role, and the link then stops working", async () => {
    const r = await inviteStaff(prisma, orgId, ownerId, { email: newEmail.toUpperCase(), role: "TUTOR" }, "http://localhost:3100");
    expect(r.emailed).toBe(false);
    const raw = tokenOf(r.link);
    expect(await invitationForToken(prisma, raw)).toMatchObject({ email: newEmail, role: "TUTOR", hasAccount: false, organizationName: "Easy STEM School" });
    await expect(acceptInvitation(prisma, raw, { password: "long enough pw" })).rejects.toThrow(/name/);
    await expect(acceptInvitation(prisma, raw, { name: "New Tutor", password: "short" })).rejects.toThrow(/10 characters/);
    await acceptInvitation(prisma, raw, { name: "New Tutor", password: "long enough pw" });
    const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: orgId, user: { email: newEmail } } });
    expect(m.role).toBe("TUTOR");
    expect(await invitationForToken(prisma, raw)).toBeNull();
    await expect(acceptInvitation(prisma, raw, { name: "x", password: "long enough pw" })).rejects.toThrow(InviteError);
    await expect(inviteStaff(prisma, orgId, ownerId, { email: newEmail, role: "TUTOR" }, "x")).rejects.toThrow(/already on the team/);
  });

  it("someone with an account elsewhere joins with their own password", async () => {
    const r = await inviteStaff(prisma, orgId, ownerId, { email: oldEmail, role: "ACCOUNTANT" }, "http://localhost:3100");
    const raw = tokenOf(r.link);
    expect((await invitationForToken(prisma, raw))?.hasAccount).toBe(true);
    await expect(acceptInvitation(prisma, raw, { password: "wrong password" })).rejects.toThrow(/not the password/);
    await acceptInvitation(prisma, raw, { password: "existing password" });
    expect(await prisma.membership.count({ where: { user: { email: oldEmail } } })).toBe(2);
  });

  it("re-inviting replaces the old link; cancelling kills it", async () => {
    const email = `${TAG}-again@example.com`;
    const first = tokenOf((await inviteStaff(prisma, orgId, ownerId, { email, role: "TUTOR" }, "x")).link);
    const second = await inviteStaff(prisma, orgId, ownerId, { email, role: "OWNER" }, "x");
    expect(await invitationForToken(prisma, first)).toBeNull();
    expect((await invitationForToken(prisma, tokenOf(second.link)))?.role).toBe("OWNER");
    await cancelInvitation(prisma, orgId, second.invitation.id);
    expect(await invitationForToken(prisma, tokenOf(second.link))).toBeNull();
  });
});

describe("team rules", () => {
  it("changes a role, keeps an owner, and removes a member", async () => {
    const { members } = await teamFor(prisma, orgId);
    const tutor = members.find((m) => m.user.email === newEmail)!;
    await changeRole(prisma, orgId, tutor.id, "ACCOUNTANT");
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: tutor.id } })).role).toBe("ACCOUNTANT");
    const owners = members.filter((m) => m.role === "OWNER");
    if (owners.length === 1) await expect(changeRole(prisma, orgId, owners[0].id, "TUTOR")).rejects.toThrow(/at least one owner/);
    await expect(removeMember(prisma, orgId, owners[0].id, owners[0].userId)).rejects.toThrow(/yourself/);
    await removeMember(prisma, orgId, tutor.id, ownerId);
    expect(await prisma.membership.count({ where: { id: tutor.id } })).toBe(0);
  });
});
