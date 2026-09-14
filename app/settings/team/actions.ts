"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireOwner } from "@/src/auth/current";
import { EmailError } from "@/src/email/send";
import { InviteError, type StaffRole, cancelInvitation, changeRole, inviteStaff, removeMember } from "@/src/auth/invites";

export interface InviteState { error?: string; ok?: string; link?: string }

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"}`;
}
const known = (e: unknown) => (e instanceof InviteError || e instanceof RoleError || e instanceof EmailError ? e.message : null);

export async function inviteAction(_p: InviteState, fd: FormData): Promise<InviteState> {
  try {
    const s = await requireOwner();
    const r = await inviteStaff(prisma, s.organizationId, s.userId, { email: String(fd.get("email") ?? ""), role: String(fd.get("role")) as StaffRole }, await origin());
    revalidatePath("/settings/team");
    return r.emailed ? { ok: `Invitation sent to ${r.invitation.email}`, link: r.link } : { ok: "Email is off, so copy this link and send it yourself:", link: r.link };
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
}

export async function changeRoleAction(fd: FormData): Promise<void> {
  const s = await requireOwner();
  await changeRole(prisma, s.organizationId, String(fd.get("membershipId")), String(fd.get("role")) as StaffRole).catch((e) => { if (!known(e)) throw e; });
  revalidatePath("/settings/team");
}

export async function removeMemberAction(fd: FormData): Promise<void> {
  const s = await requireOwner();
  await removeMember(prisma, s.organizationId, String(fd.get("membershipId")), s.userId).catch((e) => { if (!known(e)) throw e; });
  revalidatePath("/settings/team");
}

/** Tie a tutor-role login to the Tutor row it teaches as, so they see their own lessons and pay. */
export async function linkTutorAction(fd: FormData): Promise<void> {
  const s = await requireOwner();
  const membershipId = String(fd.get("membershipId") ?? "");
  const tutorId = String(fd.get("tutorId") ?? "");
  const m = await prisma.membership.findFirst({ where: { id: membershipId, organizationId: s.organizationId } });
  if (!m) return;
  if (tutorId) {
    const t = await prisma.tutor.findFirst({ where: { id: tutorId, organizationId: s.organizationId } });
    if (!t) return;
  }
  await prisma.membership.update({ where: { id: membershipId }, data: { tutorId: tutorId || null } });
  revalidatePath("/settings/team");
  revalidatePath("/settings/tutors");
}

export async function cancelInvitationAction(fd: FormData): Promise<void> {
  const s = await requireOwner();
  await cancelInvitation(prisma, s.organizationId, String(fd.get("invitationId"))).catch((e) => { if (!known(e)) throw e; });
  revalidatePath("/settings/team");
}
