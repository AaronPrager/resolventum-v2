"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/src/lib/ratelimit";
import { AuthError } from "@/src/auth/session";
import { signInAndSetCookie, signOutAndClearCookie } from "@/src/auth/current";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limited = !rateLimit(`login:${ip}`, 30, 900000).ok || !rateLimit(`login:${email.toLowerCase()}`, 10, 900000).ok;
  if (limited) return { error: "Too many attempts. Wait a few minutes and try again." };
  try {
    await signInAndSetCookie(email, password);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

/** Sign out lands on the front page, the same thing a visitor sees. */
export async function logoutAction(): Promise<void> {
  await signOutAndClearCookie();
  redirect("/");
}
