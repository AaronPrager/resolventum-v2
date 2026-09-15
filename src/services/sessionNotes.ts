/**
 * Session notes: the structured note a tutor writes about a student, after
 * a lesson (one per student on it) or as a general note tied to no lesson.
 * Five things a parent wants to know (covered, homework, engagement, a win,
 * a struggle) and the next lesson's goal. Written in a minute on a phone;
 * shared to the family by email the same day, by hand or by the nightly job.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { EmailError, sendEmail } from "../email/send";
import { formatDate, formatDay, formatWhen } from "../lib/format";
import { dateOnlyFromStr, localDateOnly, localDateStr, zonedToUtc } from "../lib/tz";

export class SessionNoteError extends Error {}

export interface SessionNoteInput {
  /** The lesson the note is about, or null for a general note. */
  lessonId?: string | null;
  studentId: string;
  /** A general note being edited. Lesson notes are found by lesson and student instead. */
  noteId?: string | null;
  /** "YYYY-MM-DD" for a general note; a lesson note takes the lesson's day. */
  notedOn?: string | null;
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

/**
 * Write or rewrite a note. With a lesson: one per student per lesson, found
 * by that pair. Without: a general note, dated by `notedOn` (today when not
 * given), new each time unless `noteId` names one to rewrite.
 */
export async function saveSessionNote(db: PrismaClient, organizationId: string, input: SessionNoteInput, createdById?: string | null) {
  const covered = input.covered.trim();
  if (!covered) throw new SessionNoteError("Say what was covered");
  const engagement = input.engagement ?? null;
  if (engagement !== null && (!Number.isInteger(engagement) || engagement < 1 || engagement > 5)) throw new SessionNoteError("Engagement is 1 to 5");
  const data = { covered, homework: clean(input.homework), engagement, win: clean(input.win), struggle: clean(input.struggle), nextGoal: clean(input.nextGoal) };

  if (input.lessonId) {
    const seat = await db.lessonStudent.findFirst({
      where: { lessonId: input.lessonId, studentId: input.studentId, lesson: { organizationId, deletedAt: null } },
      include: { lesson: { select: { status: true, startsAt: true, organization: { select: { timezone: true } } } } },
    });
    if (!seat) throw new SessionNoteError("That student is not on this lesson");
    if (seat.lesson.status === "CANCELLED") throw new SessionNoteError("The lesson was cancelled; restore it to write a note");
    const notedOn = localDateOnly(seat.lesson.startsAt, seat.lesson.organization.timezone);
    return db.sessionNote.upsert({
      where: { lessonId_studentId: { lessonId: input.lessonId, studentId: input.studentId } },
      create: { ...data, organizationId, lessonId: input.lessonId, studentId: input.studentId, notedOn, createdById: createdById ?? null },
      // A rewritten note goes out again if it was already shared: sharedAt is cleared.
      update: { ...data, notedOn, sharedAt: null, sharedTo: null },
    });
  }

  const student = await db.student.findFirst({ where: { id: input.studentId, organizationId, deletedAt: null }, select: { id: true, organization: { select: { timezone: true } } } });
  if (!student) throw new SessionNoteError("Student not found");
  if (input.notedOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.notedOn)) throw new SessionNoteError("The date is not valid");
  const general = { ...data, engagement: null }; // engagement rates one lesson; a general note has none
  if (input.noteId) {
    const n = await db.sessionNote.findFirst({ where: { id: input.noteId, organizationId, studentId: student.id, lessonId: null } });
    if (!n) throw new SessionNoteError("Note not found");
    // A rewrite keeps its date unless a new one is given.
    return db.sessionNote.update({ where: { id: n.id }, data: { ...general, ...(input.notedOn ? { notedOn: dateOnlyFromStr(input.notedOn) } : {}), sharedAt: null, sharedTo: null } });
  }
  const notedOn = input.notedOn ? dateOnlyFromStr(input.notedOn) : localDateOnly(new Date(), student.organization.timezone);
  return db.sessionNote.create({ data: { ...general, notedOn, organizationId, lessonId: null, studentId: student.id, createdById: createdById ?? null } });
}

export async function deleteSessionNote(db: PrismaClient, organizationId: string, noteId: string) {
  const n = await db.sessionNote.findFirst({ where: { id: noteId, organizationId } });
  if (!n) throw new SessionNoteError("Note not found");
  await db.sessionNote.delete({ where: { id: noteId } });
}

/** Notes for one student, newest day first, with the lesson they belong to when they have one. */
export async function sessionNotesForStudent(db: PrismaClient, studentId: string, take = 30) {
  return db.sessionNote.findMany({
    where: { studentId },
    include: { lesson: { select: { id: true, startsAt: true, subject: true, durationMin: true, tutor: { select: { name: true } } } } },
    orderBy: [{ notedOn: "desc" }, { createdAt: "desc" }],
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
  notedOn: Date;
  /** Null for a general note. */
  lesson: { startsAt: Date; subject: string; durationMin: number; tutor: { name: string } | null } | null;
  student: { firstName: string };
}

/** The email a parent gets. Plain text, short, nothing about money. */
export function sessionNoteEmail(o: { orgName: string; timeZone: string; parentFirst: string | null; note: NoteForMail; replyHint?: string | null }) {
  const n = o.note;
  const when = n.lesson ? formatDay(n.lesson.startsAt, o.timeZone) : formatDate(n.notedOn);
  const lines = [
    `Hello${o.parentFirst ? ` ${o.parentFirst}` : ""},`,
    "",
    n.lesson
      ? `A quick note from ${n.student.firstName}'s ${n.lesson.subject} lesson on ${when}${n.lesson.tutor ? ` with ${n.lesson.tutor.name}` : ""}.`
      : `A quick note about ${n.student.firstName}, ${when}.`,
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
  return { subject: n.lesson ? `${o.orgName}: ${n.student.firstName}'s ${n.lesson.subject} lesson, ${when}` : `${o.orgName}: a note about ${n.student.firstName}, ${when}`, text: lines.join("\n") };
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
 * Nightly: share every note about `day` (school zone) that has not gone out
 * yet, for families who want them. Returns counts.
 */
export async function shareUnsharedNotes(db: PrismaClient, organizationId: string, day: string) {
  const notes = await db.sessionNote.findMany({
    where: { organizationId, sharedAt: null, notedOn: dateOnlyFromStr(day), OR: [{ lessonId: null }, { lesson: { deletedAt: null } }] },
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

/** The latest notes across the school, or one tutor's (their lessons, plus general notes they wrote), newest day first. */
export async function recentSessionNotes(db: PrismaClient, organizationId: string, opts: { tutorId?: string | null; userId?: string | null; studentId?: string | null; take?: number } = {}) {
  return db.sessionNote.findMany({
    where: { organizationId, ...(opts.studentId ? { studentId: opts.studentId } : {}), ...(opts.tutorId ? { OR: [{ lesson: { tutorId: opts.tutorId } }, { lessonId: null, ...(opts.userId ? { createdById: opts.userId } : {}) }] } : {}) },
    include: {
      // The email and guardians are for the list's Send icon (see noteContact).
      student: { select: { id: true, firstName: true, lastName: true, email: true, account: { select: { guardians: { select: { email: true, isPrimary: true, isBilling: true } } } } } },
      lesson: { select: { id: true, startsAt: true, subject: true, tutor: { select: { name: true } } } },
    },
    orderBy: [{ notedOn: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 40,
  });
}

export interface LessonChoice { id: string; label: string; noted: boolean }

/**
 * The lessons a note or homework can be filed under, per student: the last
 * few taught, newest first, in the school's zone. A tutor sees their own.
 */
export async function recentLessonChoices(db: PrismaClient, organizationId: string, opts: { timeZone: string; tutorId?: string | null; studentIds?: string[]; days?: number; perStudent?: number }): Promise<Record<string, LessonChoice[]>> {
  const now = new Date();
  const since = new Date(now.getTime() - (opts.days ?? 180) * 86400000);
  const rows = await db.lessonStudent.findMany({
    where: {
      lesson: { organizationId, deletedAt: null, status: { not: "CANCELLED" }, startsAt: { lte: now, gte: since }, ...(opts.tutorId ? { tutorId: opts.tutorId } : {}) },
      ...(opts.studentIds ? { studentId: { in: opts.studentIds } } : {}),
    },
    select: { studentId: true, lesson: { select: { id: true, startsAt: true, subject: true, sessionNotes: { select: { studentId: true } } } } },
    orderBy: { lesson: { startsAt: "desc" } },
  });
  const per = opts.perStudent ?? 10;
  const out: Record<string, LessonChoice[]> = {};
  for (const r of rows) {
    const list = (out[r.studentId] ??= []);
    if (list.length >= per) continue;
    list.push({ id: r.lesson.id, label: `${formatWhen(r.lesson.startsAt, opts.timeZone)}${r.lesson.subject ? ` · ${r.lesson.subject}` : ""}`, noted: r.lesson.sessionNotes.some((n) => n.studentId === r.studentId) });
  }
  return out;
}
