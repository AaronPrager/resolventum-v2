import { redirect } from "next/navigation";
import { currentSession } from "@/src/auth/current";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  if (await currentSession()) redirect(next && next.startsWith("/") ? next : "/");
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Resolventum</h1>
        <p className="mb-5 text-sm text-muted">Sign in to your school.</p>
        {reset && <p className="mb-4 rounded-md bg-credit-soft px-3 py-2 text-sm text-credit">Password saved. Sign in with it.</p>}
        <LoginForm next={next ?? "/"} />
        <div className="mt-5 flex justify-between text-sm text-muted">
          <a href="/forgot" className="text-brand hover:underline">Forgot password</a>
          {process.env.REGISTRATION_OPEN !== "false" && <a href="/signup" className="text-brand hover:underline">Create an account</a>}
        </div>
      </div>
    </div>
  );
}
