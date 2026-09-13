import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/src/auth/current";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentSession()) redirect("/");
  const closed = process.env.REGISTRATION_OPEN === "false";
  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Start with Resolventum</h1>
        <p className="mb-5 text-sm text-muted">Your students, lessons, money, homework, and taxes in one place. Free to start.</p>
        {closed ? <p className="text-sm">Sign-up is closed right now.</p> : <SignupForm />}
        <p className="mt-5 text-sm text-muted">Already have an account? <Link href="/login" className="text-brand hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
