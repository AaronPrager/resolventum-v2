"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { AccountError, signUp } from "@/src/auth/account";
import { signInAndSetCookie } from "@/src/auth/current";
import { rateLimit } from "@/src/lib/ratelimit";
import { REGISTRATION_CLOSED_MESSAGE, registrationOpen } from "@/src/auth/registration";

export interface SignupState { error?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };

export async function signupAction(_p: SignupState, fd: FormData): Promise<SignupState> {
  if (!registrationOpen()) return { error: REGISTRATION_CLOSED_MESSAGE };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`signup:${ip}`, 5, 3600000).ok) return { error: "Too many sign-ups from this network. Try again later." };
  const password = String(fd.get("password") ?? "");
  try {
    await signUp(prisma, { name: str(fd, "name"), email: str(fd, "email"), password, organizationName: str(fd, "organizationName"), timezone: str(fd, "timezone") || undefined });
    await signInAndSetCookie(str(fd, "email"), password);
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    throw e;
  }
  redirect("/settings");
}
