"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { zonedToUtc } from "@/src/lib/tz";
import { LEAD_STATUSES, LeadError, type LeadStatus, createLead, deleteLead, enrollLead, setLeadStatus, updateLead } from "@/src/services/leads";
import { auditAs } from "@/src/services/audit";

export interface ActionState { error?: string; ok?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
const known = (e: unknown) => (e instanceof LeadError || e instanceof RoleError ? e.message : null);

function readLead(fd: FormData) {
  return {
    studentFirstName: str(fd, "studentFirstName"), studentLastName: str(fd, "studentLastName"), grade: str(fd, "grade"), schoolName: str(fd, "schoolName"),
    studentEmail: str(fd, "studentEmail"), studentPhone: str(fd, "studentPhone"), parentName: str(fd, "parentName"), parentEmail: str(fd, "parentEmail"), parentPhone: str(fd, "parentPhone"),
    subjects: str(fd, "subjects"), goals: str(fd, "goals"), source: str(fd, "source"), notes: str(fd, "notes"),
  };
}

export async function saveLeadAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "leadId");
  try {
    const s = await requireWriter();
    if (id) await updateLead(prisma, s.organizationId, id, readLead(fd));
    else {
      const l = await createLead(prisma, s.organizationId, readLead(fd), s.userId);
      await auditAs(prisma, s, { action: "lead.create", subjectType: "lead", subjectId: l.id, summary: `${l.studentFirstName} ${l.studentLastName}${l.source ? ` (${l.source})` : ""}` });
    }
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: id ? "Saved" : "Lead added" };
}

export async function moveLeadAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "leadId");
  const status = str(fd, "status") as LeadStatus;
  try {
    const s = await requireWriter();
    if (!LEAD_STATUSES.includes(status)) return { error: "Pick a stage" };
    const when = str(fd, "consultDate");
    const time = str(fd, "consultTime") || "16:00";
    const consultAt = when ? zonedToUtc(when, time, s.timezone) : undefined;
    const l = await setLeadStatus(prisma, s.organizationId, id, status, { consultAt, lostReason: str(fd, "lostReason") });
    await auditAs(prisma, s, { action: "lead.move", subjectType: "lead", subjectId: id, summary: `${l.studentFirstName} ${l.studentLastName}: ${status.toLowerCase().replace("_", " ")}${l.lostReason ? `, ${l.lostReason}` : ""}` });
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: "Moved" };
}

export async function enrollLeadAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "leadId");
  let studentId: string;
  try {
    const s = await requireWriter();
    const accountId = str(fd, "accountId");
    const st = await enrollLead(prisma, s.organizationId, id, accountId ? { accountId } : { accountName: str(fd, "accountName") || null });
    await auditAs(prisma, s, { action: "lead.enroll", subjectType: "student", subjectId: st.id, summary: `${st.firstName} ${st.lastName} enrolled from a lead` });
    studentId = st.id;
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/leads");
  revalidatePath("/students");
  revalidatePath("/");
  redirect(`/students/${studentId}`);
}

export async function deleteLeadAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  await deleteLead(prisma, s.organizationId, str(fd, "leadId")).catch((e) => { if (!known(e)) throw e; });
  revalidatePath("/leads");
}
