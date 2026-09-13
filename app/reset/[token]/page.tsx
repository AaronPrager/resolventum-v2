import { ResetForm } from "./ResetForm";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mb-5 text-sm text-muted">At least 10 characters. Every device gets signed out.</p>
        <ResetForm token={token} />
      </div>
    </div>
  );
}
