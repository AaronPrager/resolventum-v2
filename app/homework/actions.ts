"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { RoleError, requireSession, requireWriter } from "@/src/auth/current";
import { EmailError, sendEmail } from "@/src/email/send";
import { homeworkLinkEmail } from "@/src/email/templates";
import { AiError, aiConfigured } from "@/src/ai/generate";
import { approveFeedback, discardDraft, draftFeedback } from "@/src/ai/drafts";
import { FileError, addToLibrary, removeFromLibrary, storeFile } from "@/src/services/files";
import { HomeworkError, archiveAssignments, createAssignment, deleteAssignment, giveFeedback, markAssigned, regenerateUploadLink, unarchiveAssignment, updateAssignment } from "@/src/services/homework";

export interface ActionState { error?: string; ok?: string; link?: string }

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
function friendly(e: unknown): ActionState {
  if (e instanceof HomeworkError || e instanceof FileError || e instanceof AiError || e instanceof RoleError) return { error: e.message };
  throw e;
}

export async function createAssignmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  let id: string;
  try {
    const { assignment } = await createAssignment(prisma, s.organizationId, {
      studentId: str(fd, "studentId"), lessonId: str(fd, "lessonId") || null, title: str(fd, "title"), description: str(fd, "description") || null, dueOn: str(fd, "dueOn") || null,
      fileIds: fd.getAll("fileIds").map(String).filter(Boolean),
    }, s.userId);
    id = assignment.id;
  } catch (e) { return friendly(e); }
  revalidatePath("/homework");
  revalidatePath("/students");
  const returnTo = str(fd, "returnTo");
  redirect(`/homework/${id}${returnTo.startsWith("/") && !returnTo.startsWith("//") ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
}

export async function updateAssignmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const id = str(fd, "assignmentId");
  try { await updateAssignment(prisma, s.organizationId, id, { title: str(fd, "title"), description: str(fd, "description") || null, dueOn: str(fd, "dueOn") || null }); }
  catch (e) { return friendly(e); }
  revalidatePath(`/homework/${id}`);
  return { ok: "Saved" };
}

export async function regenerateLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const id = str(fd, "assignmentId");
  try {
    const path = await regenerateUploadLink(prisma, s.organizationId, id);
    await markAssigned(prisma, s.organizationId, id);
    revalidatePath(`/homework/${id}`);
    return { link: `${str(fd, "origin")}${path}` };
  } catch (e) { return friendly(e); }
}

export async function markAssignedAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  await markAssigned(prisma, s.organizationId, str(fd, "assignmentId"));
  revalidatePath(`/homework/${str(fd, "assignmentId")}`);
  revalidatePath("/homework");
}

export async function deleteAssignmentAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  await deleteAssignment(prisma, s.organizationId, str(fd, "assignmentId"));
  revalidatePath("/homework");
  redirect("/homework");
}

export async function feedbackAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const scoreRaw = str(fd, "score");
  try { await giveFeedback(prisma, s.organizationId, str(fd, "submissionId"), { comment: str(fd, "comment"), score: scoreRaw ? Number(scoreRaw) : null }, s.userId); }
  catch (e) { return friendly(e); }
  revalidatePath(`/homework/${str(fd, "assignmentId")}`);
  return { ok: "Feedback saved" };
}

export async function draftFeedbackAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  if (!aiConfigured()) return { error: "AI is not configured. Set GEMINI_API_KEY on the server to turn it on." };
  const sub = await prisma.submission.findFirst({ where: { id: str(fd, "submissionId"), assignment: { organizationId: s.organizationId } } });
  if (!sub) return { error: "Submission not found" };
  try { await draftFeedback(prisma, sub.id, s.userId); } catch (e) { return friendly(e); }
  revalidatePath(`/homework/${str(fd, "assignmentId")}`);
  return { ok: "Draft ready below. Edit it, then approve." };
}

export async function approveDraftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const d = await prisma.draft.findFirst({ where: { id: str(fd, "draftId"), organizationId: s.organizationId } });
  if (!d) return { error: "Draft not found" };
  try { await approveFeedback(prisma, d.id, { comment: str(fd, "comment"), score: Number(str(fd, "score")) }, s.userId); }
  catch (e) { return friendly(e); }
  revalidatePath(`/homework/${str(fd, "assignmentId")}`);
  return { ok: "Feedback saved and mastery updated" };
}

export async function discardDraftAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const d = await prisma.draft.findFirst({ where: { id: str(fd, "draftId"), organizationId: s.organizationId } });
  if (d) await discardDraft(prisma, d.id);
  revalidatePath(`/homework/${str(fd, "assignmentId")}`);
}

export async function emailLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const id = str(fd, "assignmentId");
  const to = str(fd, "to");
  const a = await prisma.assignment.findFirst({ where: { id, organizationId: s.organizationId }, include: { student: true, organization: true } });
  if (!a) return { error: "Assignment not found" };
  try {
    const path = await regenerateUploadLink(prisma, s.organizationId, id);
    const mail = homeworkLinkEmail({ orgName: a.organization.name, studentFirst: a.student.firstName, title: a.title, dueOn: a.dueOn ? a.dueOn.toISOString().slice(0, 10) : null, url: `${str(fd, "origin")}${path}`, description: a.description });
    await sendEmail(prisma, s.organizationId, "HOMEWORK_INVITE", { to, subject: mail.subject, text: mail.text, replyTo: a.organization.replyToEmail }, { type: "assignment", id });
    await markAssigned(prisma, s.organizationId, id);
  } catch (e) { if (e instanceof EmailError) return { error: e.message }; return friendly(e); }
  revalidatePath(`/homework/${id}`);
  return { ok: `Sent to ${to}. Any earlier link stopped working.` };
}

export async function uploadLibraryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one file" };
  const folder = str(fd, "folder") || null;
  try {
    for (const f of files) {
      const stored = await storeFile(prisma, { organizationId: s.organizationId, name: f.name, mimeType: f.type, data: new Uint8Array(await f.arrayBuffer()), uploadedById: s.userId });
      await addToLibrary(prisma, stored.id, folder);
    }
  } catch (e) { return friendly(e); }
  revalidatePath("/library");
  return { ok: `${files.length} file${files.length === 1 ? "" : "s"} added` };
}

export async function removeLibraryAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  const f = await prisma.file.findFirst({ where: { id: str(fd, "fileId"), organizationId: s.organizationId } });
  if (f) await removeFromLibrary(prisma, f.id);
  revalidatePath("/library");
}

export async function toggleArchiveAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  const id = String(fd.get("assignmentId"));
  if (fd.get("archived") === "1") await unarchiveAssignment(prisma, s.organizationId, id);
  else await archiveAssignments(prisma, s.organizationId, [id]);
  revalidatePath("/homework");
  revalidatePath(`/homework/${id}`);
}
