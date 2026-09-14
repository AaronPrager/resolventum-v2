import { ResetForm } from "./ResetForm";
import { AuthShell } from "@/app/AuthShell";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Set a new password</h1>
        <p className="mb-5 text-sm text-muted">At least 10 characters. Every device gets signed out.</p>
        <ResetForm token={token} />
    </AuthShell>
  );
}
