import { prisma } from "@/src/db";
import { AuthShell } from "@/app/AuthShell";
import { schoolForIntake } from "@/src/services/intake";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up for lessons" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const org = await schoolForIntake(prisma, code);
  if (!org) {
    return (
      <AuthShell>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">This sign-up link is not active</h1>
        <p className="text-sm text-muted">Ask the school for their current link.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell wide>
      <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Sign up with {org.name}</h1>
      <p className="mb-6 text-sm text-muted">Tell us about the student. It takes about two minutes.</p>
      <JoinForm code={code} schoolName={org.name} />
    </AuthShell>
  );
}
