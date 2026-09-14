/**
 * Lessons and the charges they create.
 *
 * A solo lesson is Lesson + one LessonStudent + one Charge, all sharing an id
 * on import and separate ids when created here. The charge is created with
 * the lesson (v1 behavior). Cancelling voids the charge; nothing is deleted.
 * Every change rebuilds the account's FIFO allocations.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { localDateOnly } from "../lib/tz";
import { rebuildAccountAllocations } from "./allocation";

export type Db = PrismaClient;

export interface LessonInput {
  /** Empty for an event with no student: a block of time, a meeting, a day off. No seat, no charge. */
  studentId?: string | null;
  /** Needed only when there is no student to take the school from. */
  organizationId?: string;
  /** All-day: startsAt is local midnight and durationMin is ignored (1440). */
  allDay?: boolean;
  startsAt: Date;
  durationMin: number;
  subject: string;
  priceCents: number;
  tutorId?: string | null;
  locationType?: "IN_PERSON" | "REMOTE";
  meetingLink?: string | null;
  notes?: string | null;
  category?: "TUTORING" | "COLLEGE_COUNSELING" | null;
}

export class LessonError extends Error {}

function validate(input: Omit<LessonInput, "studentId">, hasStudent = true) {
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new LessonError("Start time is not valid");
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0 || input.durationMin > 24 * 60) throw new LessonError("Duration must be between 1 and 1440 minutes");
  if (!input.subject.trim()) throw new LessonError(hasStudent ? "Subject is required" : "A title is required for an event with no student");
  if (hasStudent && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) throw new LessonError("Price must be zero or more");
}

/** The school a new lesson belongs to: the student's, or the one given for a student-less event. */
export async function resolveOwner(db: Db, input: Pick<LessonInput, "studentId" | "organizationId">) {
  if (input.studentId) {
    const student = await db.student.findUnique({ where: { id: input.studentId }, include: { organization: { select: { id: true, timezone: true } } } });
    if (!student || student.deletedAt) throw new LessonError("Student not found");
    return { student, organizationId: student.organizationId, timezone: student.organization.timezone };
  }
  if (!input.organizationId) throw new LessonError("Pick a student, or give the school for an event with no student");
  const org = await db.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, timezone: true } });
  if (!org) throw new LessonError("School not found");
  return { student: null, organizationId: org.id, timezone: org.timezone };
}

function chargeDescription(subject: string, durationMin: number) {
  return `${subject.trim()}, ${durationMin} min`;
}

export async function createLesson(db: Db, input: LessonInput, createdById?: string | null) {
  if (input.allDay) input = { ...input, durationMin: 1440 };
  validate(input, !!input.studentId);
  const { student, organizationId, timezone } = await resolveOwner(db, input);
  if (input.tutorId) {
    const tutor = await db.tutor.findFirst({ where: { id: input.tutorId, organizationId } });
    if (!tutor) throw new LessonError("Tutor not found");
  }
  const status = input.startsAt <= new Date() ? "COMPLETED" : "SCHEDULED";

  const lesson = await db.$transaction(async (tx) => {
    const lesson = await tx.lesson.create({
      data: {
        organizationId,
        tutorId: input.tutorId ?? null,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        allDay: !!input.allDay,
        subject: input.subject.trim(),
        category: input.category ?? null,
        locationType: input.locationType ?? "IN_PERSON",
        meetingLink: input.meetingLink?.trim() || null,
        notes: input.notes?.trim() || null,
        status,
        createdById: createdById ?? null,
      },
    });
    if (!student) return lesson;
    const seat = await tx.lessonStudent.create({
      data: { lessonId: lesson.id, studentId: student.id, priceCents: input.priceCents, status },
    });
    await tx.charge.create({
      data: {
        organizationId,
        accountId: student.accountId,
        studentId: student.id,
        lessonStudentId: seat.id,
        kind: "LESSON",
        amountCents: input.priceCents,
        chargedOn: localDateOnly(input.startsAt, timezone),
        description: chargeDescription(input.subject, input.durationMin),
      },
    });
    return lesson;
  });
  if (student) await rebuildAccountAllocations(db, student.accountId);
  return lesson;
}

export interface LessonUpdate {
  startsAt?: Date;
  allDay?: boolean;
  durationMin?: number;
  subject?: string;
  priceCents?: number;
  tutorId?: string | null;
  locationType?: "IN_PERSON" | "REMOTE";
  meetingLink?: string | null;
  notes?: string | null;
  category?: "TUTORING" | "COLLEGE_COUNSELING" | null;
}

/** Edit a solo lesson. The charge follows the lesson: price, date, and description are kept in step. */
export async function updateLesson(db: Db, lessonId: string, patch: LessonUpdate) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      organization: { select: { timezone: true } },
      students: { include: { charge: true, student: { select: { accountId: true } } } },
    },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  if (lesson.students.length > 1) throw new LessonError("Group lessons are edited per seat; not supported yet");
  const seat = lesson.students[0] ?? null; // null for an event with no student
  const allDay = patch.allDay ?? lesson.allDay;

  const next = {
    startsAt: patch.startsAt ?? lesson.startsAt,
    durationMin: allDay ? 1440 : patch.durationMin ?? lesson.durationMin,
    subject: patch.subject ?? lesson.subject,
    priceCents: patch.priceCents ?? seat?.priceCents ?? 0,
  };
  validate({ ...next, tutorId: patch.tutorId }, !!seat);
  if (patch.tutorId) {
    const tutor = await db.tutor.findFirst({ where: { id: patch.tutorId, organizationId: lesson.organizationId } });
    if (!tutor) throw new LessonError("Tutor not found");
  }
  const cancelled = lesson.status === "CANCELLED" || lesson.status === "NO_SHOW";
  const status = cancelled ? lesson.status : next.startsAt <= new Date() ? "COMPLETED" : "SCHEDULED";

  await db.$transaction(async (tx) => {
    await tx.lesson.update({
      where: { id: lessonId },
      data: {
        startsAt: next.startsAt,
        durationMin: next.durationMin,
        allDay,
        subject: next.subject.trim(),
        status,
        ...(patch.tutorId !== undefined ? { tutorId: patch.tutorId } : {}),
        ...(patch.locationType !== undefined ? { locationType: patch.locationType } : {}),
        ...(patch.meetingLink !== undefined ? { meetingLink: patch.meetingLink?.trim() || null } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      },
    });
    if (!seat) return;
    await tx.lessonStudent.update({ where: { id: seat.id }, data: { priceCents: next.priceCents, status } });
    if (seat.charge && !seat.charge.voidedAt) {
      await tx.charge.update({
        where: { id: seat.charge.id },
        data: {
          amountCents: next.priceCents,
          chargedOn: localDateOnly(next.startsAt, lesson.organization.timezone),
          description: chargeDescription(next.subject, next.durationMin),
        },
      });
    }
  });
  if (seat) await rebuildAccountAllocations(db, seat.student.accountId);
}

/** Cancel a lesson: status CANCELLED, charge voided. Pass chargeAnyway to keep the charge (a late-cancel fee). */
/** `reason` is optional; a blank one is stored as "Cancelled". */
export async function cancelLesson(db: Db, lessonId: string, reasonIn = "", opts: { chargeAnyway?: boolean } = {}) {
  const reason = reasonIn.trim() || "Cancelled";
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { students: { include: { charge: true, student: { select: { accountId: true } } } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");

  await db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: lessonId }, data: { status: "CANCELLED" } });
    await tx.lessonStudent.updateMany({ where: { lessonId }, data: { status: "CANCELLED" } });
    if (!opts.chargeAnyway) {
      for (const seat of lesson.students) {
        if (seat.charge && !seat.charge.voidedAt) {
          await tx.charge.update({ where: { id: seat.charge.id }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
        }
      }
    }
  });
  for (const accountId of new Set(lesson.students.map((s) => s.student.accountId))) {
    await rebuildAccountAllocations(db, accountId);
  }
}

/** Undo a cancellation: status back to SCHEDULED or COMPLETED, charge un-voided. */
export async function restoreLesson(db: Db, lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { students: { include: { charge: true, student: { select: { accountId: true } } } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  const status = lesson.startsAt <= new Date() ? "COMPLETED" : "SCHEDULED";
  await db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: lessonId }, data: { status } });
    await tx.lessonStudent.updateMany({ where: { lessonId }, data: { status } });
    for (const seat of lesson.students) {
      if (seat.charge?.voidedAt) {
        await tx.charge.update({ where: { id: seat.charge.id }, data: { voidedAt: null, voidReason: null } });
      }
    }
  });
  for (const accountId of new Set(lesson.students.map((s) => s.student.accountId))) {
    await rebuildAccountAllocations(db, accountId);
  }
}

/**
 * Delete a lesson or event. It is kept in the database with deletedAt set, so
 * nothing is lost, but it leaves the calendar, the student page, and the feed.
 * Its charges are voided so the balance drops, same as a cancellation.
 */
export async function deleteLesson(db: Db, lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { students: { include: { charge: true, student: { select: { accountId: true } } } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: lessonId }, data: { deletedAt: now } });
    for (const seat of lesson.students) {
      if (seat.charge && !seat.charge.voidedAt) {
        await tx.charge.update({ where: { id: seat.charge.id }, data: { voidedAt: now, voidReason: "Lesson deleted" } });
      }
    }
  });
  for (const accountId of new Set(lesson.students.map((s) => s.student.accountId))) {
    await rebuildAccountAllocations(db, accountId);
  }
}
