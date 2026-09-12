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
  studentId: string;
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

function validate(input: Omit<LessonInput, "studentId">) {
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new LessonError("Start time is not valid");
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0 || input.durationMin > 24 * 60) throw new LessonError("Duration must be between 1 and 1440 minutes");
  if (!input.subject.trim()) throw new LessonError("Subject is required");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new LessonError("Price must be zero or more");
}

function chargeDescription(subject: string, durationMin: number) {
  return `${subject.trim()}, ${durationMin} min`;
}

export async function createLesson(db: Db, input: LessonInput, createdById?: string | null) {
  validate(input);
  const student = await db.student.findUnique({
    where: { id: input.studentId },
    include: { organization: { select: { id: true, timezone: true } } },
  });
  if (!student || student.deletedAt) throw new LessonError("Student not found");
  if (input.tutorId) {
    const tutor = await db.tutor.findFirst({ where: { id: input.tutorId, organizationId: student.organizationId } });
    if (!tutor) throw new LessonError("Tutor not found");
  }
  const status = input.startsAt <= new Date() ? "COMPLETED" : "SCHEDULED";

  const lesson = await db.$transaction(async (tx) => {
    const lesson = await tx.lesson.create({
      data: {
        organizationId: student.organizationId,
        tutorId: input.tutorId ?? null,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        subject: input.subject.trim(),
        category: input.category ?? null,
        locationType: input.locationType ?? "IN_PERSON",
        meetingLink: input.meetingLink?.trim() || null,
        notes: input.notes?.trim() || null,
        status,
        createdById: createdById ?? null,
      },
    });
    const seat = await tx.lessonStudent.create({
      data: { lessonId: lesson.id, studentId: student.id, priceCents: input.priceCents, status },
    });
    await tx.charge.create({
      data: {
        organizationId: student.organizationId,
        accountId: student.accountId,
        studentId: student.id,
        lessonStudentId: seat.id,
        kind: "LESSON",
        amountCents: input.priceCents,
        chargedOn: localDateOnly(input.startsAt, student.organization.timezone),
        description: chargeDescription(input.subject, input.durationMin),
      },
    });
    return lesson;
  });
  await rebuildAccountAllocations(db, student.accountId);
  return lesson;
}

export interface LessonUpdate {
  startsAt?: Date;
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
  if (lesson.students.length !== 1) throw new LessonError("Group lessons are edited per seat; not supported yet");
  const seat = lesson.students[0];

  const next = {
    startsAt: patch.startsAt ?? lesson.startsAt,
    durationMin: patch.durationMin ?? lesson.durationMin,
    subject: patch.subject ?? lesson.subject,
    priceCents: patch.priceCents ?? seat.priceCents,
  };
  validate({ ...next, tutorId: patch.tutorId });
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
        subject: next.subject.trim(),
        status,
        ...(patch.tutorId !== undefined ? { tutorId: patch.tutorId } : {}),
        ...(patch.locationType !== undefined ? { locationType: patch.locationType } : {}),
        ...(patch.meetingLink !== undefined ? { meetingLink: patch.meetingLink?.trim() || null } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      },
    });
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
  await rebuildAccountAllocations(db, seat.student.accountId);
}

/** Cancel a lesson: status CANCELLED, charge voided. Pass chargeAnyway to keep the charge (a late-cancel fee). */
export async function cancelLesson(db: Db, lessonId: string, reason: string, opts: { chargeAnyway?: boolean } = {}) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { students: { include: { charge: true, student: { select: { accountId: true } } } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  if (!reason.trim()) throw new LessonError("A reason is required");

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
