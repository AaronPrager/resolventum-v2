import { prisma } from "@/src/db";
import type { SessionUser } from "@/src/auth/session";
import { SessionNoteError } from "@/src/services/sessionNotes";

/** A note with what the note page and its actions need to know about it. */
export async function noteFor(session: SessionUser, noteId: string) {
  const n = await prisma.sessionNote.findFirst({
    where: { id: noteId, organizationId: session.organizationId },
    include: {
      lesson: { select: { id: true, startsAt: true, subject: true, tutorId: true } },
      student: { select: { id: true, firstName: true, lastName: true, email: true, account: { select: { guardians: true } } } },
    },
  });
  if (!n) return null;
  // A tutor sees notes on their lessons and the general notes they wrote.
  if (session.role === "TUTOR" && !(n.lesson ? n.lesson.tutorId === session.tutorId : n.createdById === session.userId)) return null;
  return n;
}

/** Throws unless the lesson is in the school and, for a tutor, theirs. */
export async function checkLesson(session: SessionUser, lessonId: string) {
  const l = await prisma.lesson.findFirst({ where: { id: lessonId, organizationId: session.organizationId, deletedAt: null }, select: { id: true, tutorId: true } });
  if (!l) throw new SessionNoteError("Lesson not found");
  if (session.role === "TUTOR" && l.tutorId !== session.tutorId) throw new SessionNoteError("Not one of your lessons");
}

/** Where a note goes: the primary parent with an email, else billing, else any, else the student. */
export function noteContact(student: { email: string | null; account: { guardians: { email: string | null; isPrimary: boolean; isBilling: boolean }[] } }): string {
  const g = student.account.guardians.filter((x) => x.email);
  return (g.find((x) => x.isPrimary) ?? g.find((x) => x.isBilling) ?? g[0])?.email ?? student.email ?? "";
}
