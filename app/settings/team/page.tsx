import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatDate } from "@/src/lib/format";
import { ROLE_LABEL, STAFF_ROLES, teamFor } from "@/src/auth/invites";
import { Card, Empty, PageHeader } from "@/src/components/ui";
import { InviteForm } from "./forms";
import { InvitationRows, MemberRows } from "./MemberRows";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

export default async function TeamPage() {
  const s = await requireSession();
  const { members, invitations } = await teamFor(prisma, s.organizationId);
  const tutors = await prisma.tutor.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const owner = s.role === "OWNER";
  const roles = STAFF_ROLES.map((r) => [r, ROLE_LABEL[r]] as [string, string]);
  return (
    <div className="space-y-6">
      <PageHeader title="Team" back={{ href: "/settings", label: "Office" }} subtitle="People who sign in to this school. Tutors you schedule live under Office, Tutors; link a tutor's login here and they see only their own lessons, students, and pay." />
      {owner && <Card title="Invite someone"><InviteForm roles={roles} /></Card>}
      <Card title={`Members (${members.length})`} description="Change a role or link a tutor with the drop-downs; they save as you pick.">
        <MemberRows
          owner={owner}
          meId={s.userId}
          roles={[...STAFF_ROLES]}
          tutors={tutors}
          members={members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, tutorId: m.tutorId }))}
        />
      </Card>
      <Card title="Waiting to accept" description="Inviting the same email again sends a fresh link and cancels the old one.">
        {invitations.length === 0 ? <Empty>No open invitations.</Empty> : (
          <InvitationRows owner={owner} invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expires: formatDate(i.expiresAt), expired: i.expiresAt < new Date() }))} />
        )}
      </Card>
    </div>
  );
}
