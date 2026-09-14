import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { devAutoLoginUserId, setSessionCookie } from "@/src/auth/current";
import { signInWithoutPassword } from "@/src/auth/session";

export const dynamic = "force-dynamic";

/**
 * Development only. The sign-in page sends "Log in" here when DEV_AUTO_LOGIN
 * is set; a real session is opened for the configured person and the browser
 * goes on to the page it wanted. Outside development this is a 404.
 */
export async function GET(req: Request) {
  const userId = await devAutoLoginUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const h = await headers();
  const token = await signInWithoutPassword(prisma, userId, { userAgent: h.get("user-agent"), ip: "local" });
  await setSessionCookie(token);
  const next = new URL(req.url).searchParams.get("next");
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
