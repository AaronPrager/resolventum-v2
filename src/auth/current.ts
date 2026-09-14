/**
 * Next.js side of sessions: read the cookie, or send to /login.
 * Server components and server actions call requireSession().
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { COOKIE_NAME, SESSION_DAYS, type SessionUser, sessionFromToken, signIn as coreSignIn, signOut as coreSignOut } from "./session";

/**
 * Development only: with DEV_AUTO_LOGIN set, a request with no cookie is
 * treated as that person, so nobody types a password on localhost. "true"
 * means the first owner; an email means that user. Never in production, and
 * the browser tests clear the variable so they still exercise real sign-in.
 */
export function devAutoLogin(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const v = process.env.DEV_AUTO_LOGIN?.trim();
  return v && v !== "false" && v !== "0" ? v : null;
}

async function devSession(): Promise<SessionUser | null> {
  const who = devAutoLogin();
  if (!who) return null;
  const m = await prisma.membership.findFirst({
    where: who.includes("@") ? { user: { email: who.toLowerCase(), deletedAt: null } } : { role: "OWNER", user: { deletedAt: null } },
    include: { user: true, organization: true, tutor: { select: { timezone: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!m) return null;
  return { userId: m.user.id, email: m.user.email, name: m.user.name, organizationId: m.organizationId, organizationName: m.organization.name, timezone: (m.role === "TUTOR" && m.tutor?.timezone) || m.organization.timezone, organizationTimezone: m.organization.timezone, role: m.role, tutorId: m.tutorId };
}

export async function currentSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  return (await sessionFromToken(prisma, jar.get(COOKIE_NAME)?.value)) ?? devSession();
}

export async function requireSession(): Promise<SessionUser> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s;
}

export async function signInAndSetCookie(email: string, password: string) {
  const h = await headers();
  const token = await coreSignIn(prisma, email, password, { userAgent: h.get("user-agent"), ip: h.get("x-forwarded-for")?.split(",")[0] });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function signOutAndClearCookie() {
  const jar = await cookies();
  await coreSignOut(prisma, jar.get(COOKIE_NAME)?.value);
  jar.delete(COOKIE_NAME);
}

export class RoleError extends Error {}

/** Accountants can read everything and change nothing. Owners and tutors can write. */
/** Owners only: team, school settings, and anything that changes who can do what. */
export async function requireOwner(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role !== "OWNER") throw new RoleError("Only an owner can do this.");
  return s;
}

export async function requireWriter(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role === "ACCOUNTANT") throw new RoleError("Your role is read-only. Ask the owner to make changes.");
  return s;
}

/** The tutor a login is limited to: their own Tutor row when the role is TUTOR, else null (sees everyone). */
export function tutorScope(s: SessionUser): string | null {
  return s.role === "TUTOR" ? s.tutorId ?? "none" : null;
}

/** Money pages: accounts, payments, expenses, reports. A tutor is sent to their own pay page instead. */
export async function requireMoney(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role === "TUTOR") redirect("/earnings");
  return s;
}
