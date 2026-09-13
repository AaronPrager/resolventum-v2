"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { AccountError, resetPassword } from "@/src/auth/account";

export interface ResetState { error?: string }

export async function resetAction(_p: ResetState, fd: FormData): Promise<ResetState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords do not match" };
  try { await resetPassword(prisma, token, password); }
  catch (e) { if (e instanceof AccountError) return { error: e.message }; throw e; }
  redirect("/login?reset=1");
}
