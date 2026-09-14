/**
 * Session notes: the structured note a tutor writes after a lesson, one per
 * student on it. Five things a parent wants to know (covered, homework,
 * engagement, a win, a struggle) and the next lesson's goal. Written in a
 * minute on a phone; shared to the family by email the same day, by hand or
 * by the nightly job.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { EmailError, sendEmail } from "../email/send";
import { formatDay } from "../lib/format";
import { localDateStr, zonedToUtc } from "../lib/tz";

export class SessionNoteError extends Error {}

export interface SessionNoteInput {
  lessonId: string;
  studentId: string;
  covered: string;
  homework?: string | null;
  /** 1 to 5, or null when not rated. */
  engagement?: number | null;
  win?: string | null;
  struggle?: string | null;
  nextGoal?: string | null;
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

export const ENGAGEMENT_LABELS: Record<number, string> = { 1: "checked out", 2: "distracted", 3: "steady", 4: "engaged", 5: "fully engaged" };

/** Write or rewrite the note for one student on one lesson. */
export async function saveSessionNote(db: PrismaClient, organizationId: string, input: SessionNoteInput, createdById?: string | null) {
  const seat = await db.lessonStudent.findFirst({
    where: { lessonId: input.lessonId, studentId: input.studentId, lesson: { organizationId, deletedAt: null } },
    include: { lesson: { select: { status: true } } },
  });
  if (!seat) throw new SessionNoteError("That student is not on this lesson");
  if (seat.lesson.status === "CANCELLED") throw new SessionNoteError("The lesson was cancelled; restore it to write a note");
  const covered = input.covered.trim();
  if (!covered) throw new SessionNoteError("Say what was covered");
  const engagement = input.engagement ?? null;
  if (engagement !== null && (!Number.isInteger(engagement) || engagement < 1 || engagement > 5)) throw new SessionNoteError("Engagement is 1 to 5");
  const data = { covered, homework: clean(input.homework), engagement, win: clean(input.win), struggle: clean(input.struggle), nextGoal: clean(input.nextGoal) };
  return db.sessionNote.upsert({
    where: { lessonId_studentId: { lessonId: input.lessonId, studentId: input.studentId } },
    create: { ...data, organizationId, lessonId: input.lessonId, studentId: input.studentId, createdById: createdById ?? null },
    // A rewritten note goes out again if it was already shared: sharedAt is cleared.
    update: { ...data, sharedAt: null, sharedTo: null },
  });
}

export async function deleteSessionNote(db: PrismaClient, organizationId: string, noteId: string) {
  const n = await db.sessionNote.findFirst({ where: { id: noteId, organizationId } });
  if (!n) throw new SessionNoteError("Note not found");
  await db.sessionNote.delete({ where: { id: noteId } });
}

/** Notes for one student, newest first, with the lesson they belong to. */
export async function sessionNotesForStudent(db: PrismaClient, studentId: string, take = 30) {
  return db.sessionNote.findMany({
    where: { studentId },
    include: { lesson: { select: { id: true, startsAt: true, subject: true, durationMin: true, tutor: { select: { name: true } } } } },
    orderBy: { lesson: { startsAt: "desc" } },
    take,
  });
}

/** Lessons in a day range (school zone) with a student and no note yet: what the tutor still owes the parent. */
export async function lessonsMissingNotes(db: PrismaClient, organizationId: string, opts: { from: string; to: string; timeZone: string; tutorId?: string | null }) {
  const lessons = await db.lesson.findMany({
    where: {
      organizationId, deletedAt: null, allDay: false, status: "COMPLETED",
      startsAt: { gte: zonedToUtc(opts.from, "00:00", opts.timeZone), lt: zonedToUtc(opts.to, "00:00", opts.timeZone) },
      ...(opts.tutorId ? { tutorId: opts.tutorId } : {}),
      students: { some: {} },
    },
    include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true, archivedAt: true } } } }, sessionNotes: { select: { studentId: true } }, tutor: { select: { name: true } } },
    orderBy: { startsAt: "desc" },
  });
  const out: { lessonId: string; startsAt: Date; subject: string; tutor: string | null; students: { id: string; name: string }[] }[] = [];
  for (const l of lessons) {
    const noted = new Set(l.sessionNotes.map((n) => n.studentId));
    const missing = l.students.filter((s) => !noted.has(s.studentId) && !s.student.archivedAt).map((s) => ({ id: s.student.id, name: `${s.student.firstName} ${s.student.lastName}` }));
    if (missing.length) out.push({ lessonId: l.id, startsAt: l.startsAt, subject: l.subject, tutor: l.tutor?.name ?? null, students: missing });
  }
  return out;
}

// ---------------------------------------------------------------- sharing

interface NoteForMail {
  covered: string; homework: string | null; engagement: number | null; win: string | null; struggle: string | null; nextGoal: string | null;
  lesson: { startsAt: Date; subject: string; durationMin: number; tutor: { name: string } | null };
  student: { firstName: string };
}

/** The email a parent gets. Plain text, short, nothing about money. */
export function sessionNoteEmail(o: { orgName: string; timeZone: string; parentFirst: string | null; note: NoteForMail; replyHint?: string | null }) {
  const n = o.note;
  const when = formatDay(n.lesson.startsAt, o.timeZone);
  const lines = [
    `Hello${o.parentFirst ? ` ${o.parentFirst}` : ""},`,
    "",
    `A quick note from ${n.student.firstName}'s ${n.lesson.subject} lesson on ${when}${n.lesson.tutor ? ` with ${n.lesson.tutor.name}` : ""}.`,
    "",
    `What we covered: ${n.covered}`,
    n.win ? `A win: ${n.win}` : null,
    n.struggle ? `Still working on: ${n.struggle}` : null,
    n.engagement ? `Engagement: ${ENGAGEMENT_LABELS[n.engagement] ?? n.engagement}` : null,
    n.homework ? `Homework: ${n.homework}` : null,
    n.nextGoal ? `Next time: ${n.nextGoal}` : null,
    "",
    o.replyHint ?? "Reply to this email with any questions.",
    "",
    "Thank you,",
    o.orgName,
  ].filter((l) => l !== null);
  return { subject: `${o.orgName}: ${n.student.firstName}'s ${n.lesson.subject} lesson, ${when}`, text: lines.join("\n") };
}

/** Who a student's notes go to: the main contact, then billing, then any contact with an email, then the student. */
function noteRecipient(account: { emailNotes: boolean; guardians: { name: string; email: string | null; isPrimary: boolean; isBilling: boolean }[] }, student: { email: string | null; firstName: string }) {
  const withEmail = account.guardians.filter((g) => g.email);
  const g = withEmail.find((x) => x.isPrimary) ?? withEmail.find((x) => x.isBilling) ?? withEmail[0] ?? null;
  if (g) return { to: g.email!, first: g.name.split(" ")[0] };
  if (student.email) return { to: student.email, first: student.firstName };
  return null;
}

/** Email one note to the family (or to `to` when given). Marks it shared. */
export async function shareSessionNote(db: PrismaClient, organizationId: string, noteId: string, opts: { to?: string | null } = {}) {
  const note = await db.sessionNote.findFirst({
    where: { id: noteId, organizationId },
    include: {
      lesson: { select: { startsAt: true, subject: true, durationMin: true, tutor: { select: { name: true } } } },
      student: { include: { account: { include: { guardians: true } } } },
      organization: { select: { name: true, timezone: true, replyToEmail: true, phone: true } },
    },
  });
  if (!note) throw new SessionNoteError("Note not found");
  const auto = noteRecipient(note.student.account, note.student);
  const to = opts.to?.trim() || auto?.to;
  if (!to) throw new SessionNoteError("No email on file for this family. Add a parent contact first.");
  const mail = sessionNoteEmail({
    orgName: note.organization.name, timeZone: note.organization.timezone, parentFirst: opts.to ? null : auto?.first ?? null, note,
    replyHint: note.organization.phone ? `Reply to this email or call ${note.organization.phone} with any questions.` : null,
  });
  await sendEmail(db, organizationId, "SESSION_NOTE", { to, subject: mail.subject, text: mail.text, replyTo: note.organization.replyToEmail }, { type: "sessionNote", id: note.id });
  return db.sessionNote.update({ where: { id: noteId }, data: { sharedAt: new Date(), sharedTo: to } });
}

/**
 * Nightly: share every note written for a lesson on `day` (school zone) that
 * has not gone out yet, for families who want them. Returns counts.
 */
export async function shareUnsharedNotes(db: PrismaClient, organizationId: string, day: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const next = localDateStr(new Date(zonedToUtc(day, "00:00", org.timezone).getTime() + 36 * 3600_000), org.timezone);
  const notes = await db.sessionNote.findMany({
    where: { organizationId, sharedAt: null, lesson: { deletedAt: null, startsAt: { gte: zonedToUtc(day, "00:00", org.timezone), lt: zonedToUtc(next, "00:00", org.timezone) } } },
    include: { student: { select: { account: { select: { emailNotes: true } } } } },
  });
  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];
  for (const n of notes) {
    if (!n.student.account.emailNotes) { skipped++; continue; }
    try {
      await shareSessionNote(db, organizationId, n.id);
      sent++;
    } catch (e) {
      if (e instanceof SessionNoteError) { skipped++; continue; }
      if (!(e instanceof EmailError)) throw e;
      failed++;
      errors.push(e.message);
    }
  }
  return { sent, skipped, failed, errors };
}
