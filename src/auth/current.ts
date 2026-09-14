/**
 * Next.js side of sessions: read the cookie, or send to /login.
 * Server components and server actions call requireSession().
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { COOKIE_NAME, SESSION_DAYS, type SessionUser, sessionFromToken, signIn as coreSignIn, signOut as coreSignOut } from "./session";

export async function currentSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  return sessionFromToken(prisma, jar.get(COOKIE_NAME)?.value);
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
