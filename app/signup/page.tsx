import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/src/auth/current";
import { SignupForm } from "./SignupForm";
import { AuthShell } from "@/app/AuthShell";
import { REGISTRATION_CLOSED_MESSAGE, registrationOpen } from "@/src/auth/registration";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentSession()) redirect("/");
  const closed = !registrationOpen();
  return (
    <AuthShell wide>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Start with Resolventum</h1>
        <p className="mb-5 text-sm text-muted">Your students, lessons, money, homework, and taxes in one place. Free to start.</p>
        {closed ? <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn" role="status" data-testid="signup-closed">{REGISTRATION_CLOSED_MESSAGE}</p> : <SignupForm />}
        <p className="mt-5 text-sm text-muted">Already have an account? <Link href="/login" className="text-brand hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
