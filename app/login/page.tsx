import { redirect } from "next/navigation";
import { currentSession, devAutoLogin } from "@/src/auth/current";
import { LoginForm } from "./LoginForm";
import { AuthShell } from "@/app/AuthShell";
import { registrationOpen } from "@/src/auth/registration";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  const to = next && next.startsWith("/") ? next : "/";
  if (await currentSession()) redirect(to);
  // Development: no form, a session is opened for the configured person and you land in the app.
  if (devAutoLogin()) redirect(`/api/dev-login?next=${encodeURIComponent(to)}`);
  return (
    <AuthShell>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Welcome back</h1>
        <p className="mb-5 text-sm text-muted">Sign in to your school.</p>
        {reset && <p className="mb-4 rounded-md bg-credit-soft px-3 py-2 text-sm text-credit">Password saved. Sign in with it.</p>}
        <LoginForm next={next ?? "/"} />
        <div className="mt-5 flex justify-between text-sm text-muted">
          <a href="/forgot" className="text-brand hover:underline">Forgot password</a>
          {registrationOpen() ? <a href="/signup" className="text-brand hover:underline">Create an account</a> : <span className="text-faint" title="Currently not accepting new accounts">Sign-up closed</span>}
        </div>
    </AuthShell>
  );
}
