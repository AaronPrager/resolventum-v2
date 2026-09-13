import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Forgot your password</h1>
        <p className="mb-5 text-sm text-muted">Enter your email and we send a link to set a new one.</p>
        <ForgotForm />
        <p className="mt-5 text-sm text-muted"><Link href="/login" className="text-brand hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  );
}
