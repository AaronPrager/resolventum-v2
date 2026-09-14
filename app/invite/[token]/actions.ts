"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { signInAndSetCookie } from "@/src/auth/current";
import { InviteError, acceptInvitation } from "@/src/auth/invites";
import { rateLimit } from "@/src/lib/ratelimit";

export interface AcceptState { error?: string }

export async function acceptInviteAction(_p: AcceptState, fd: FormData): Promise<AcceptState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!process.env.DISABLE_RATE_LIMIT && !rateLimit(`invite:${ip}`, 10, 10 * 60_000).ok) return { error: "Too many tries. Wait a few minutes." };
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  try {
    const { email } = await acceptInvitation(prisma, token, { name: String(fd.get("name") ?? ""), password });
    await signInAndSetCookie(email, password);
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    throw e;
  }
  redirect("/calendar");
}
