"use server";

import { redirect } from "next/navigation";
import { AuthError } from "@/src/auth/session";
import { signInAndSetCookie, signOutAndClearCookie } from "@/src/auth/current";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/");
  try {
    await signInAndSetCookie(email, password);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  await signOutAndClearCookie();
  redirect("/login");
}
