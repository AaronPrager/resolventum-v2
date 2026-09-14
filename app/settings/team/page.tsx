import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatDate } from "@/src/lib/format";
import { ROLE_LABEL, STAFF_ROLES, teamFor } from "@/src/auth/invites";
import { Avatar, Badge, Button, Card, Empty, PageHeader } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { cancelInvitationAction, changeRoleAction, linkTutorAction, removeMemberAction } from "./actions";
import { InviteForm } from "./forms";

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
      <Card title={`Members (${members.length})`}>
        <ul className="divide-y divide-line" data-testid="members">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={m.user.name} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{m.user.name}{m.userId === s.userId && <span className="ml-2 text-xs font-normal text-muted">you</span>}</div>
                <div className="text-muted">{m.user.email}</div>
                {m.role === "TUTOR" && (
                  owner ? (
                    <form action={linkTutorAction} className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="membershipId" value={m.id} />
                      <select name="tutorId" defaultValue={m.tutorId ?? ""} aria-label={`Tutor for ${m.user.name}`} className="h-8 rounded-lg border border-line bg-surface pl-2 text-xs shadow-xs">
                        <option value="">Not linked to a tutor</option>
                        {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <Button variant="ghost" className="h-8 text-xs">Link</Button>
                    </form>
                  ) : (
                    <div className="text-xs text-muted">{m.tutorId ? `teaches as ${tutors.find((t) => t.id === m.tutorId)?.name ?? "a tutor"}` : "not linked to a tutor"}</div>
                  )
                )}
              </div>
              {owner && m.userId !== s.userId ? (
                <div className="flex items-center gap-2">
                  <form action={changeRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="membershipId" value={m.id} />
                    <select name="role" defaultValue={m.role} aria-label={`Role for ${m.user.name}`} className="h-9 rounded-lg border border-line bg-surface pl-3 text-sm shadow-xs">
                      {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                    </select>
                    <Button variant="secondary">Change</Button>
                  </form>
                  <ConfirmForm action={removeMemberAction} message={`Remove ${m.user.name}? They are signed out and can no longer open this school.`}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <Button variant="ghost" className="text-owed">Remove</Button>
                  </ConfirmForm>
                </div>
              ) : (
                <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{m.role.toLowerCase()}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Waiting to accept">
        {invitations.length === 0 ? <Empty>No open invitations.</Empty> : (
          <ul className="divide-y divide-line" data-testid="invitations">
            {invitations.map((i) => {
              const expired = i.expiresAt < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="font-medium">{i.email}</span>
                  <Badge>{i.role.toLowerCase()}</Badge>
                  <span className="text-muted">{expired ? "expired" : `expires ${formatDate(i.expiresAt)}`}</span>
                  {owner && (
                    <form action={cancelInvitationAction} className="ml-auto">
                      <input type="hidden" name="invitationId" value={i.id} />
                      <Button variant="ghost">Cancel</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Inviting the same email again sends a fresh link and cancels the old one.</p>
      </Card>
    </div>
  );
}
