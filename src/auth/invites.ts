/**
 * Staff invitations. The owner invites an email with a role; the link carries a
 * single-use token (Token kind INVITE, hashed, 14 days). Opening it either makes
 * a new account or, for an email that already has one, asks for that password.
 * A school always keeps at least one owner.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { emailConfigured, sendEmail } from "../email/send";
import { hashPassword, verifyPassword } from "./password";

export class InviteError extends Error {}

export type StaffRole = "OWNER" | "TUTOR" | "ACCOUNTANT";
export const STAFF_ROLES: StaffRole[] = ["OWNER", "TUTOR", "ACCOUNTANT"];
const DAYS = 14;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: "Owner: everything, including settings and staff",
  TUTOR: "Tutor: calendar, students, homework, and payments",
  ACCOUNTANT: "Accountant: can see everything, cannot change anything",
};

/** Create or refresh an invitation and email the link. Returns the link so it can be copied when email is off. */
export async function inviteStaff(db: PrismaClient, organizationId: string, invitedById: string, input: { email: string; role: StaffRole; tutorId?: string | null }, origin: string) {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) throw new InviteError("Enter a valid email");
  if (!STAFF_ROLES.includes(input.role)) throw new InviteError("Pick a role");
  const existing = await db.membership.findFirst({ where: { organizationId, user: { email } } });
  if (existing) throw new InviteError("That person is already on the team");
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const inviter = await db.user.findUnique({ where: { id: invitedById }, select: { name: true } });

  const raw = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + DAYS * 86400000);
  const invitation = await db.$transaction(async (tx) => {
    const inv = await tx.invitation.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: { organizationId, email, role: input.role, invitedById, expiresAt },
      update: { role: input.role, invitedById, expiresAt, acceptedAt: null },
    });
    await tx.token.updateMany({ where: { kind: "INVITE", subjectId: inv.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.token.create({ data: { organizationId, kind: "INVITE", tokenHash: hash(raw), subjectId: inv.id, expiresAt } });
    return inv;
  });

  const link = `${origin}/invite/${raw}`;
  let emailed = false;
  if (emailConfigured()) {
    await sendEmail(db, organizationId, "INVITE", {
      to: email,
      subject: `${inviter?.name ?? org.name} invited you to ${org.name} on Resolventum`,
      text: [
        "Hello,",
        "",
        `${inviter?.name ?? "The owner"} invited you to join ${org.name} on Resolventum as ${input.role.toLowerCase()}.`,
        "",
        "Open this link to accept. It works once and expires in 14 days:",
        link,
        "",
        "If you were not expecting this, you can ignore it.",
      ].join("\n"),
      replyTo: org.replyToEmail,
    }, { type: "invitation", id: invitation.id });
    emailed = true;
  }
  return { invitation, link, emailed };
}

async function tokenRow(db: PrismaClient, raw: string) {
  const t = await db.token.findUnique({ where: { tokenHash: hash(raw) } });
  if (!t || t.kind !== "INVITE" || t.usedAt || t.revokedAt || (t.expiresAt && t.expiresAt < new Date())) return null;
  const inv = await db.invitation.findUnique({ where: { id: t.subjectId }, include: { organization: { select: { name: true } } } });
  if (!inv || inv.acceptedAt) return null;
  return { token: t, invitation: inv };
}

/** What the invite page shows. Null when the link is used, revoked, or expired. */
export async function invitationForToken(db: PrismaClient, raw: string) {
  const r = await tokenRow(db, raw);
  if (!r) return null;
  const user = await db.user.findUnique({ where: { email: r.invitation.email }, select: { id: true, deletedAt: true } });
  return { email: r.invitation.email, role: r.invitation.role as StaffRole, organizationName: r.invitation.organization.name, hasAccount: !!user && !user.deletedAt };
}

/**
 * Accept: a new account (name and password) or an existing one (its password).
 * Returns the email, so the caller can sign the person in with the password they typed.
 */
export async function acceptInvitation(db: PrismaClient, raw: string, input: { name?: string; password: string }) {
  const r = await tokenRow(db, raw);
  if (!r) throw new InviteError("This invitation link is used, cancelled, or expired. Ask for a new one.");
  const { invitation } = r;
  const user = await db.user.findUnique({ where: { email: invitation.email } });

  if (user && !user.deletedAt) {
    if (!user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) throw new InviteError("That is not the password for this account");
  } else {
    if (!input.name?.trim()) throw new InviteError("Your name is required");
    if (input.password.length < 10) throw new InviteError("Use at least 10 characters for the password");
  }

  await db.$transaction(async (tx) => {
    const u = user && !user.deletedAt
      ? user
      : await tx.user.create({ data: { email: invitation.email, name: input.name!.trim(), passwordHash: await hashPassword(input.password), emailVerifiedAt: new Date() } });
    const already = await tx.membership.findFirst({ where: { userId: u.id, organizationId: invitation.organizationId } });
    if (!already) await tx.membership.create({ data: { userId: u.id, organizationId: invitation.organizationId, role: invitation.role } });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await tx.token.update({ where: { id: r.token.id }, data: { usedAt: new Date() } });
  });
  return { email: invitation.email };
}

export async function teamFor(db: PrismaClient, organizationId: string) {
  const [members, invitations] = await Promise.all([
    db.membership.findMany({ where: { organizationId, role: { in: STAFF_ROLES } }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    db.invitation.findMany({ where: { organizationId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return { members, invitations };
}

async function ownersLeft(db: PrismaClient, organizationId: string, exceptMembershipId: string) {
  return db.membership.count({ where: { organizationId, role: "OWNER", id: { not: exceptMembershipId } } });
}

export async function changeRole(db: PrismaClient, organizationId: string, membershipId: string, role: StaffRole) {
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId } });
  if (!m) throw new InviteError("Team member not found");
  if (!STAFF_ROLES.includes(role)) throw new InviteError("Pick a role");
  if (m.role === "OWNER" && role !== "OWNER" && (await ownersLeft(db, organizationId, m.id)) === 0) throw new InviteError("The school needs at least one owner");
  return db.membership.update({ where: { id: membershipId }, data: { role } });
}

export async function removeMember(db: PrismaClient, organizationId: string, membershipId: string, byUserId: string) {
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId } });
  if (!m) throw new InviteError("Team member not found");
  if (m.userId === byUserId) throw new InviteError("You cannot remove yourself");
  if (m.role === "OWNER" && (await ownersLeft(db, organizationId, m.id)) === 0) throw new InviteError("The school needs at least one owner");
  await db.$transaction([
    db.authSession.deleteMany({ where: { userId: m.userId } }),
    db.membership.delete({ where: { id: membershipId } }),
  ]);
}

export async function cancelInvitation(db: PrismaClient, organizationId: string, invitationId: string) {
  const inv = await db.invitation.findFirst({ where: { id: invitationId, organizationId, acceptedAt: null } });
  if (!inv) throw new InviteError("Invitation not found");
  await db.$transaction([
    db.token.updateMany({ where: { kind: "INVITE", subjectId: inv.id, usedAt: null }, data: { revokedAt: new Date() } }),
    db.invitation.delete({ where: { id: inv.id } }),
  ]);
}
