import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/src/auth/current";
import { SignupForm } from "./SignupForm";
import { AuthShell } from "@/app/AuthShell";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentSession()) redirect("/");
  const closed = process.env.REGISTRATION_OPEN === "false";
  return (
    <AuthShell wide>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Start with Resolventum</h1>
        <p className="mb-5 text-sm text-muted">Your students, lessons, money, homework, and taxes in one place. Free to start.</p>
        {closed ? <p className="text-sm">Sign-up is closed right now.</p> : <SignupForm />}
        <p className="mt-5 text-sm text-muted">Already have an account? <Link href="/login" className="text-brand hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
