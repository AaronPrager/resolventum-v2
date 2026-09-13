"use server";

import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { requestPasswordReset } from "@/src/auth/account";
import { EmailError } from "@/src/email/send";
import { rateLimit } from "@/src/lib/ratelimit";

export interface ForgotState { error?: string; ok?: string }

export async function forgotAction(_p: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "").trim();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`forgot:${ip}`, 5, 900000).ok || !rateLimit(`forgot:${email.toLowerCase()}`, 3, 900000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"}`;
  try {
    await requestPasswordReset(prisma, email, origin);
  } catch (e) {
    if (e instanceof EmailError) return { error: e.message };
    throw e;
  }
  return { ok: "If that email has an account, a reset link is on its way. It works for one hour." };
}
