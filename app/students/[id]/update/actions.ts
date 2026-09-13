"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { requireSession, requireWriter } from "@/src/auth/current";
import { EmailError, sendEmail } from "@/src/email/send";
import { AiError, aiConfigured } from "@/src/ai/generate";
import { discardDraft, draftParentReport, markApproved } from "@/src/ai/drafts";
import { dateOnlyFromStr } from "@/src/lib/tz";

export interface UpdateState { error?: string; ok?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };

export async function draftUpdateAction(_p: UpdateState, fd: FormData): Promise<UpdateState> {
  const s = await requireSession();
  if (!aiConfigured()) return { error: "AI is not configured. Set GEMINI_API_KEY on the server to turn it on." };
  const studentId = str(fd, "studentId");
  const from = str(fd, "from"); const to = str(fd, "to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { error: "Pick a period" };
  const st = await prisma.student.findFirst({ where: { id: studentId, organizationId: s.organizationId } });
  if (!st) return { error: "Student not found" };
  try { await draftParentReport(prisma, st.id, { from: dateOnlyFromStr(from), to: dateOnlyFromStr(to), createdById: s.userId }); }
  catch (e) { if (e instanceof AiError) return { error: e.message }; throw e; }
  revalidatePath(`/students/${studentId}/update`);
  return { ok: "Draft ready. Read it, edit it, then mark it approved and send it from your email." };
}

export async function approveUpdateAction(_p: UpdateState, fd: FormData): Promise<UpdateState> {
  const s = await requireSession();
  const d = await prisma.draft.findFirst({ where: { id: str(fd, "draftId"), organizationId: s.organizationId } });
  if (!d) return { error: "Draft not found" };
  await markApproved(prisma, d.id, { ...(d.content as object), subject: str(fd, "subject"), body: str(fd, "body") });
  revalidatePath(`/students/${str(fd, "studentId")}/update`);
  return { ok: "Approved. Copy the text into your email to send it." };
}

export async function sendUpdateAction(_p: UpdateState, fd: FormData): Promise<UpdateState> {
  const s = await requireWriter();
  const d = await prisma.draft.findFirst({ where: { id: str(fd, "draftId"), organizationId: s.organizationId } });
  if (!d) return { error: "Draft not found" };
  const to = str(fd, "to");
  const subject = str(fd, "subject"); const body = str(fd, "body");
  if (!subject || !body) return { error: "Subject and body are required" };
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: s.organizationId } });
  try {
    await sendEmail(prisma, s.organizationId, "OTHER", { to, subject, text: body, replyTo: org.replyToEmail }, { type: "draft", id: d.id });
  } catch (e) { if (e instanceof EmailError) return { error: e.message }; throw e; }
  await markApproved(prisma, d.id, { ...(d.content as object), subject, body, sent_to: to, sent_at: new Date().toISOString() });
  revalidatePath(`/students/${str(fd, "studentId")}/update`);
  return { ok: `Sent to ${to}` };
}

export async function discardUpdateAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const d = await prisma.draft.findFirst({ where: { id: str(fd, "draftId"), organizationId: s.organizationId } });
  if (d) await discardDraft(prisma, d.id);
  revalidatePath(`/students/${str(fd, "studentId")}/update`);
}
