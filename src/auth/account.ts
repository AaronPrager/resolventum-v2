/**
 * Accounts: sign-up (a new organization with its owner), password reset by
 * email, and password change. Reset tokens are Token rows of kind
 * PASSWORD_RESET, hashed, single use, one hour.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { sendEmail } from "../email/send";
import { hashPassword, verifyPassword } from "./password";
import { revokeAllSessions } from "./session";

export class AccountError extends Error {}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "school";
}

function checkPassword(p: string) {
  if (p.length < 10) throw new AccountError("Use at least 10 characters for the password");
  if (p.length > 200) throw new AccountError("That password is too long");
}

export async function signUp(db: PrismaClient, input: { name: string; email: string; password: string; organizationName: string; timezone?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Enter a valid email");
  if (!input.name.trim()) throw new AccountError("Your name is required");
  if (!input.organizationName.trim()) throw new AccountError("The school or business name is required");
  checkPassword(input.password);
  if (await db.user.findUnique({ where: { email } })) throw new AccountError("An account with that email already exists. Sign in instead.");
  let slug = slugify(input.organizationName);
  for (let i = 2; await db.organization.findUnique({ where: { slug } }); i++) slug = `${slugify(input.organizationName)}-${i}`;
  const year = new Date().getFullYear();
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: input.organizationName.trim(), slug, timezone: input.timezone || "America/New_York", onboardingCompletedAt: new Date() } });
    const user = await tx.user.create({ data: { email, name: input.name.trim(), passwordHash: await hashPassword(input.password), emailVerifiedAt: new Date() } });
    await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
    await tx.taxYear.create({ data: { organizationId: org.id, year } });
    return { user, organization: org };
  });
}

/** Always resolves the same way whether or not the email exists, so it cannot be used to probe for accounts. */
export async function requestPasswordReset(db: PrismaClient, email: string, origin: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { memberships: { take: 1 } } });
  if (!user || user.deletedAt) return;
  const raw = randomBytes(24).toString("base64url");
  await db.token.updateMany({ where: { kind: "PASSWORD_RESET", subjectId: user.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.token.create({ data: { organizationId: user.memberships[0]?.organizationId ?? null, kind: "PASSWORD_RESET", tokenHash: hash(raw), subjectId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
  const url = `${origin}/reset/${raw}`;
  await sendEmail(db, user.memberships[0]?.organizationId ?? "", "PASSWORD_RESET", {
    to: user.email,
    subject: "Reset your Resolventum password",
    text: `Hi ${user.name},\n\nSomeone asked to reset the password for this email. If it was you, open this link within an hour:\n\n${url}\n\nIf it was not you, ignore this message. Nothing changes until the link is used.`,
  }, { type: "user", id: user.id });
}

export async function resetPassword(db: PrismaClient, raw: string, password: string) {
  checkPassword(password);
  const t = await db.token.findUnique({ where: { tokenHash: hash(raw) } });
  if (!t || t.kind !== "PASSWORD_RESET" || t.usedAt || t.revokedAt || (t.expiresAt && t.expiresAt < new Date())) throw new AccountError("This reset link is not valid any more. Ask for a new one.");
  await db.$transaction([
    db.user.update({ where: { id: t.subjectId }, data: { passwordHash: await hashPassword(password) } }),
    db.token.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllSessions(db, t.subjectId);
}

export async function changePassword(db: PrismaClient, userId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new AccountError("The current password is wrong");
  checkPassword(next);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
}
