/**
 * Cookie sessions on the AuthSession table.
 *
 * The cookie holds a random token; the table holds its SHA-256. A session
 * lasts SESSION_DAYS and is refreshed when it has under half its life left.
 * Sign-out revokes the row, so a stolen cookie dies with it.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { verifyPassword } from "./password";

import { COOKIE_NAME, SESSION_DAYS } from "./constants";
export { COOKIE_NAME, SESSION_DAYS };

export class AuthError extends Error {}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  /** The zone times are shown and typed in: the tutor's own when they set one, else the school's. */
  timezone: string;
  /** The school's zone, for charges and anything shared with families. */
  organizationTimezone: string;
  role: string;
  /** The Tutor row this login represents, when the role is TUTOR and the owner linked them. */
  tutorId: string | null;
}

/** Check email and password. Returns the raw session token to put in the cookie. */
export async function signIn(db: PrismaClient, email: string, password: string, meta: { userAgent?: string | null; ip?: string | null } = {}) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = user && !user.deletedAt && (await verifyPassword(password, user.passwordHash));
  if (!ok) throw new AuthError("Email or password is wrong");
  const membership = await db.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!membership) throw new AuthError("This account has no organization");
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
    },
  });
  return token;
}

/** Resolve a cookie token to the signed-in user, or null. Extends the session when it is past half life. */
export async function sessionFromToken(db: PrismaClient, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const s = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: { include: { organization: true, tutor: { select: { timezone: true } } }, orderBy: { createdAt: "asc" }, take: 1 } } } },
  });
  if (!s || s.revokedAt || s.expiresAt < new Date() || s.user.deletedAt) return null;
  const m = s.user.memberships[0];
  if (!m) return null;
  if (s.expiresAt.getTime() - Date.now() < (SESSION_DAYS * 86400000) / 2) {
    await db.authSession.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) } });
  }
  return {
    userId: s.user.id,
    email: s.user.email,
    name: s.user.name,
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    timezone: (m.role === "TUTOR" && m.tutor?.timezone) || m.organization.timezone,
    organizationTimezone: m.organization.timezone,
    role: m.role,
    tutorId: m.tutorId,
  };
}

export async function signOut(db: PrismaClient, token: string | undefined | null) {
  if (!token) return;
  await db.authSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(db: PrismaClient, userId: string) {
  await db.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
