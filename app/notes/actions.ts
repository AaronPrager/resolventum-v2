"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { EmailError } from "@/src/email/send";
import { auditAs } from "@/src/services/audit";
import { SessionNoteError, deleteSessionNote, saveSessionNote, shareSessionNote } from "@/src/services/sessionNotes";
import { checkLesson, noteFor } from "./access";

export interface ActionState { error?: string; ok?: string }

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
const safeReturn = (s: string) => (s.startsWith("/") && !s.startsWith("//") ? s : "");

function refresh(studentId: string, lessonId: string | null) {
  revalidatePath("/notes");
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  if (lessonId) revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/");
}

/** Write a note, new or rewritten, for a lesson or general. The one place notes are saved. */
export async function saveNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  const lessonId = str(fd, "lessonId") || null;
  const noteId = str(fd, "noteId") || null;
  const returnTo = safeReturn(str(fd, "returnTo"));
  let id: string;
  try {
    const session = await requireWriter();
    if (lessonId) await checkLesson(session, lessonId);
    if (noteId && !(await noteFor(session, noteId))) return { error: "Note not found" };
    const eng = str(fd, "engagement");
    const n = await saveSessionNote(prisma, session.organizationId, {
      studentId, lessonId, noteId, notedOn: str(fd, "notedOn") || null, covered: str(fd, "covered"),
      win: str(fd, "win"), struggle: str(fd, "struggle"), homework: str(fd, "homework"), nextGoal: str(fd, "nextGoal"), engagement: eng ? Number(eng) : null,
    }, session.userId);
    id = n.id;
  } catch (e) {
    if (e instanceof SessionNoteError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  refresh(studentId, lessonId);
  revalidatePath(`/notes/${id}`);
  redirect(returnTo || `/notes/${id}`);
}

/** Email the note to the family. */
export async function shareNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const noteId = str(fd, "noteId");
  try {
    const session = await requireWriter();
    const note = await noteFor(session, noteId);
    if (!note) return { error: "Note not found" };
    const n = await shareSessionNote(prisma, session.organizationId, noteId, { to: str(fd, "to") || null });
    await auditAs(prisma, session, { action: "note.share", subjectType: "note", subjectId: n.id, summary: `${note.student.firstName} ${note.student.lastName}, ${note.notedOn.toISOString().slice(0, 10)}, sent to ${n.sharedTo}` });
    refresh(note.studentId, note.lessonId);
    revalidatePath(`/notes/${noteId}`);
    return { ok: `Sent to ${n.sharedTo}` };
  } catch (e) {
    if (e instanceof SessionNoteError || e instanceof EmailError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
}

export async function deleteNoteAction(fd: FormData): Promise<void> {
  const session = await requireWriter();
  const note = await noteFor(session, str(fd, "noteId"));
  if (!note) return;
  await deleteSessionNote(prisma, session.organizationId, note.id);
  refresh(note.studentId, note.lessonId);
  redirect(safeReturn(str(fd, "returnTo")) || "/notes");
}
