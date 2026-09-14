import Link from "next/link";
import { ForgotForm } from "./ForgotForm";
import { AuthShell } from "@/app/AuthShell";

export default function ForgotPage() {
  return (
    <AuthShell>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Forgot your password</h1>
        <p className="mb-5 text-sm text-muted">Enter your email and we send a link to set a new one.</p>
        <ForgotForm />
        <p className="mt-5 text-sm text-muted"><Link href="/login" className="text-brand hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
