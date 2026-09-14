import Link from "next/link";
import { prisma } from "@/src/db";
import { AuthShell } from "@/app/AuthShell";
import { invitationForToken } from "@/src/auth/invites";
import { AcceptForm } from "./AcceptForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a school" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invitationForToken(prisma, token);
  if (!inv) {
    return (
      <AuthShell>
        <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">This link has expired</h1>
        <p className="text-sm text-muted">The invitation was already used, cancelled, or is more than 14 days old. Ask the person who invited you for a new one.</p>
        <p className="mt-5 text-sm"><Link href="/login" className="text-brand hover:underline">Go to sign in</Link></p>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <h1 className="mb-1 text-xl font-semibold tracking-[-0.02em]">Join {inv.organizationName}</h1>
      <p className="mb-5 text-sm text-muted">You were invited as {inv.role.toLowerCase()}.</p>
      <AcceptForm token={token} email={inv.email} hasAccount={inv.hasAccount} />
    </AuthShell>
  );
}
