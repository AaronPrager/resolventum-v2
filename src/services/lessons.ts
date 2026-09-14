/**
 * Lessons and the charges they create.
 *
 * A lesson has a roster: zero students (an event), one (a solo lesson), or
 * several (a group). Each student on it has a seat with their own price and a
 * charge on their family account. Cancelling voids or reduces the charge per
 * the school's cancellation policy; taking a student off a group voids theirs;
 * nothing with money in it is deleted.
 * Every change rebuilds the allocations of each account it touches.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { localDateOnly, localDateStr } from "../lib/tz";
import { rebuildAccountAllocations } from "./allocation";
import { checkLessonCategory } from "./lessonCategories";

export type Db = PrismaClient;

export interface Seat {
  studentId: string;
  priceCents: number;
}

export interface LessonInput {
  /** The roster. Takes precedence over studentId + priceCents. Empty for an event with no student. */
  seats?: Seat[];
  /** Shorthand for a one-student roster. */
  studentId?: string | null;
  /** Needed when there is no student to take the school from. */
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
  /** One of the school's lesson categories, or null. */
  categoryId?: string | null;
}

export class LessonError extends Error {}

/** The roster an input describes, checked for shape (not yet for the database). */
export function seatsOf(input: Pick<LessonInput, "seats" | "studentId" | "priceCents">): Seat[] {
  const seats = input.seats ?? (input.studentId ? [{ studentId: input.studentId, priceCents: input.priceCents }] : []);
  const seen = new Set<string>();
  for (const s of seats) {
    if (!s.studentId) throw new LessonError("Pick a student for every row");
    if (seen.has(s.studentId)) throw new LessonError("A student is listed twice");
    seen.add(s.studentId);
    if (!Number.isInteger(s.priceCents) || s.priceCents < 0) throw new LessonError("Price must be zero or more");
  }
  return seats;
}

function validate(input: { startsAt: Date; durationMin: number; subject: string }, hasStudents: boolean) {
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new LessonError("Start time is not valid");
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0 || input.durationMin > 24 * 60) throw new LessonError("Duration must be between 1 and 1440 minutes");
  if (!input.subject.trim()) throw new LessonError(hasStudents ? "Subject is required" : "A title is required for an event with no student");
}

export interface RosterStudent { id: string; accountId: string; organizationId: string }

/**
 * The school a lesson belongs to and the students on it. Every student must be
 * in the same school, and in the one given when a school is given.
 */
export async function resolveRoster(db: Db, input: Pick<LessonInput, "seats" | "studentId" | "priceCents" | "organizationId">) {
  const seats = seatsOf(input);
  const students = seats.length ? await db.student.findMany({ where: { id: { in: seats.map((s) => s.studentId) }, deletedAt: null }, select: { id: true, accountId: true, organizationId: true } }) : [];
  if (students.length !== seats.length) throw new LessonError("Student not found");
  const orgIds = new Set(students.map((s) => s.organizationId));
  if (input.organizationId) orgIds.add(input.organizationId);
  if (orgIds.size === 0) throw new LessonError("Pick a student, or give the school for an event with no student");
  if (orgIds.size > 1) throw new LessonError("Student not found");
  const organizationId = [...orgIds][0];
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, timezone: true } });
  if (!org) throw new LessonError("School not found");
  const byId = new Map(students.map((s) => [s.id, s]));
  return { seats: seats.map((s) => ({ ...s, student: byId.get(s.studentId)! })), organizationId, timezone: org.timezone };
}

/** Kept for callers that only need the school. */
export async function resolveOwner(db: Db, input: Pick<LessonInput, "seats" | "studentId" | "priceCents" | "organizationId">) {
  const r = await resolveRoster(db, input);
  return { organizationId: r.organizationId, timezone: r.timezone, seats: r.seats };
}

export function chargeDescription(subject: string, durationMin: number, groupSize = 1) {
  return `${subject.trim() || "Lesson"}${groupSize > 1 ? " (group)" : ""}, ${durationMin} min`;
}

type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/** One seat and its charge. */
export async function addSeat(tx: Tx, o: { organizationId: string; timezone: string; lessonId: string; startsAt: Date; subject: string; durationMin: number; groupSize: number; status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"; seat: Seat & { student: RosterStudent } }) {
  const seat = await tx.lessonStudent.create({ data: { lessonId: o.lessonId, studentId: o.seat.studentId, priceCents: o.seat.priceCents, status: o.status } });
  await tx.charge.create({
    data: {
      organizationId: o.organizationId,
      accountId: o.seat.student.accountId,
      studentId: o.seat.studentId,
      lessonStudentId: seat.id,
      kind: "LESSON",
      amountCents: o.seat.priceCents,
      chargedOn: localDateOnly(o.startsAt, o.timezone),
      description: chargeDescription(o.subject, o.durationMin, o.groupSize),
      ...(o.status === "CANCELLED" ? { voidedAt: new Date(), voidReason: "Lesson cancelled" } : {}),
    },
  });
  return seat;
}

export async function createLesson(db: Db, input: LessonInput, createdById?: string | null) {
  if (input.allDay) input = { ...input, durationMin: 1440 };
  const { seats, organizationId, timezone } = await resolveRoster(db, input);
  validate(input, seats.length > 0);
  if (input.tutorId) {
    const tutor = await db.tutor.findFirst({ where: { id: input.tutorId, organizationId } });
    if (!tutor) throw new LessonError("Tutor not found");
  }
  const status = input.startsAt <= new Date() ? "COMPLETED" : "SCHEDULED";
  const categoryId = await checkLessonCategory(db, organizationId, input.categoryId);

  const lesson = await db.$transaction(async (tx) => {
    const lesson = await tx.lesson.create({
      data: {
        organizationId,
        tutorId: input.tutorId ?? null,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        allDay: !!input.allDay,
        subject: input.subject.trim(),
        categoryId,
        locationType: input.locationType ?? "IN_PERSON",
        meetingLink: input.meetingLink?.trim() || null,
        notes: input.notes?.trim() || null,
        status,
        createdById: createdById ?? null,
      },
    });
    for (const seat of seats) {
      await addSeat(tx, { organizationId, timezone, lessonId: lesson.id, startsAt: input.startsAt, subject: input.subject, durationMin: input.durationMin, groupSize: seats.length, status, seat });
    }
    return lesson;
  });
  for (const accountId of new Set(seats.map((s) => s.student.accountId))) await rebuildAccountAllocations(db, accountId);
  return lesson;
}

export interface LessonUpdate {
  startsAt?: Date;
  allDay?: boolean;
  durationMin?: number;
  subject?: string;
  /** Solo lessons only: the one seat's price. Use seats for groups. */
  priceCents?: number;
  /** The whole new roster. Students left out are taken off (their charge voided); new ones get a seat and a charge. */
  seats?: Seat[];
  tutorId?: string | null;
  locationType?: "IN_PERSON" | "REMOTE";
  meetingLink?: string | null;
  notes?: string | null;
  categoryId?: string | null;
}

/** Edit a lesson and its roster. Charges follow: price, date, and description are kept in step. */
export async function updateLesson(db: Db, lessonId: string, patch: LessonUpdate) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      organization: { select: { timezone: true } },
      students: { include: { charge: true, student: { select: { id: true, accountId: true, organizationId: true } } } },
    },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  const tz = lesson.organization.timezone;
  const allDay = patch.allDay ?? lesson.allDay;
  const next = {
    startsAt: patch.startsAt ?? lesson.startsAt,
    durationMin: allDay ? 1440 : patch.durationMin ?? lesson.durationMin,
    subject: patch.subject ?? lesson.subject,
  };

  // The roster after the edit.
  let wanted: Seat[];
  if (patch.seats) wanted = seatsOf({ seats: patch.seats, priceCents: 0 });
  else if (patch.priceCents !== undefined && lesson.students.length === 1) wanted = [{ studentId: lesson.students[0].studentId, priceCents: patch.priceCents }];
  else wanted = lesson.students.map((s) => ({ studentId: s.studentId, priceCents: s.priceCents }));
  if (patch.priceCents !== undefined && !patch.seats) {
    if (!Number.isInteger(patch.priceCents) || patch.priceCents < 0) throw new LessonError("Price must be zero or more");
  }
  validate(next, wanted.length > 0);

  const current = new Map(lesson.students.map((s) => [s.studentId, s]));
  const added = wanted.filter((w) => !current.has(w.studentId));
  const removed = lesson.students.filter((s) => !wanted.some((w) => w.studentId === s.studentId));
  const cancelled = lesson.status === "CANCELLED" || lesson.status === "NO_SHOW";
  if (cancelled && (added.length || removed.length)) throw new LessonError("Restore the lesson before changing who is in it");
  const newStudents = added.length ? (await resolveRoster(db, { seats: added, priceCents: 0, organizationId: lesson.organizationId })).seats : [];

  if (patch.tutorId) {
    const tutor = await db.tutor.findFirst({ where: { id: patch.tutorId, organizationId: lesson.organizationId } });
    if (!tutor) throw new LessonError("Tutor not found");
  }
  const status = cancelled ? lesson.status : next.startsAt <= new Date() ? "COMPLETED" : "SCHEDULED";
  const groupSize = wanted.length;
  const categoryId = patch.categoryId !== undefined ? await checkLessonCategory(db, lesson.organizationId, patch.categoryId) : undefined;

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
        ...(categoryId !== undefined ? { categoryId } : {}),
      },
    });
    for (const seat of removed) {
      if (seat.charge && !seat.charge.voidedAt) {
        await tx.charge.update({ where: { id: seat.charge.id }, data: { voidedAt: new Date(), voidReason: "Taken off the lesson" } });
      }
      await tx.lessonStudent.delete({ where: { id: seat.id } }); // the voided charge stays, unlinked
    }
    for (const w of wanted) {
      const seat = current.get(w.studentId);
      if (!seat) continue;
      await tx.lessonStudent.update({ where: { id: seat.id }, data: { priceCents: w.priceCents, status } });
      if (seat.charge && !seat.charge.voidedAt) {
        await tx.charge.update({
          where: { id: seat.charge.id },
          data: { amountCents: w.priceCents, chargedOn: localDateOnly(next.startsAt, tz), description: chargeDescription(next.subject, next.durationMin, groupSize) },
        });
      }
    }
    for (const seat of newStudents) {
      await addSeat(tx, { organizationId: lesson.organizationId, timezone: tz, lessonId, startsAt: next.startsAt, subject: next.subject, durationMin: next.durationMin, groupSize, status, seat });
    }
  });
  const accounts = new Set([...lesson.students.map((s) => s.student.accountId), ...newStudents.map((s) => s.student.accountId)]);
  for (const accountId of accounts) await rebuildAccountAllocations(db, accountId);
}

// ---------------------------------------------------------------- cancellation policy

export interface CancellationPolicy {
  lateCancelHours: number;
  lateCancelChargePercent: number;
  noShowChargePercent: number;
  makeupOnLateCancel: boolean;
}

/** What the school's policy says about a cancellation made `now` for a lesson at `startsAt`. */
export function cancellationOutcome(policy: CancellationPolicy, startsAt: Date, now = new Date()) {
  const hoursAhead = (startsAt.getTime() - now.getTime()) / 3600_000;
  const late = hoursAhead < policy.lateCancelHours;
  return { late, hoursAhead, chargePercent: late ? policy.lateCancelChargePercent : 0 };
}

async function policyOf(db: Db, organizationId: string): Promise<CancellationPolicy> {
  const o = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { lateCancelHours: true, lateCancelChargePercent: true, noShowChargePercent: true, makeupOnLateCancel: true } });
  return o;
}

/** Apply a percentage to every live seat charge: 0 voids it, 100 keeps it, anything between reduces it and says so. */
async function applyChargePercent(tx: Tx, seats: { priceCents: number; charge: { id: string; voidedAt: Date | null; description: string } | null }[], percent: number, reason: string, subject: string, durationMin: number, groupSize: number) {
  for (const seat of seats) {
    if (!seat.charge || seat.charge.voidedAt) continue;
    if (percent <= 0) {
      await tx.charge.update({ where: { id: seat.charge.id }, data: { voidedAt: new Date(), voidReason: reason } });
    } else {
      const amountCents = Math.round((seat.priceCents * Math.min(percent, 100)) / 100);
      const base = chargeDescription(subject, durationMin, groupSize);
      await tx.charge.update({ where: { id: seat.charge.id }, data: { amountCents, description: percent < 100 ? `${base} (${reason}, ${percent}%)` : `${base} (${reason})` } });
    }
  }
}

export interface CancelOptions {
  /** true keeps the full charge, false voids it. Leave unset to let the school's policy decide by how late the cancellation is. */
  chargeAnyway?: boolean;
  /** Override the policy's percentage outright. */
  chargePercent?: number;
  now?: Date;
}

/**
 * Cancel a lesson. The charge follows the cancellation policy: an early
 * cancellation releases it, a late one is charged the policy's percentage, and
 * a make-up credit is issued when the policy says so. Both can be overridden.
 * Returns what was applied so the caller can say it.
 */
export async function cancelLesson(db: Db, lessonId: string, reasonIn = "", opts: CancelOptions = {}) {
  const reason = reasonIn.trim() || "Cancelled";
  const now = opts.now ?? new Date();
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { students: { include: { charge: true, student: { select: { accountId: true } } } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");

  const policy = await policyOf(db, lesson.organizationId);
  const outcome = cancellationOutcome(policy, lesson.startsAt, now);
  const percent = opts.chargePercent !== undefined ? opts.chargePercent : opts.chargeAnyway === true ? 100 : opts.chargeAnyway === false ? 0 : outcome.chargePercent;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new LessonError("Charge percent must be 0 to 100");
  const label = opts.chargeAnyway === undefined && opts.chargePercent === undefined && outcome.late ? "late cancellation" : reason;

  await db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: lessonId }, data: { status: "CANCELLED" } });
    await tx.lessonStudent.updateMany({ where: { lessonId }, data: { status: "CANCELLED" } });
    await applyChargePercent(tx, lesson.students, percent, percent > 0 ? label : reason, lesson.subject, lesson.durationMin, lesson.students.length);
  });
  for (const accountId of new Set(lesson.students.map((s) => s.student.accountId))) {
    await rebuildAccountAllocations(db, accountId);
  }
  const makeup = percent > 0 && opts.chargePercent === undefined && opts.chargeAnyway === undefined && outcome.late && policy.makeupOnLateCancel
    ? await issueMakeupCredit(db, lessonId, { reason: "Late cancellation" })
    : 0;
  return { late: outcome.late, chargePercent: percent, makeupCredits: makeup };
}

/** The student did not turn up. Status NO_SHOW; the charge follows the no-show policy (or `chargePercent`). */
export async function markNoShow(db: Db, lessonId: string, opts: { chargePercent?: number } = {}) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { students: { include: { charge: true, student: { select: { accountId: true } } } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  if (lesson.students.length === 0) throw new LessonError("An event with no student cannot be a no-show");
  if (lesson.status === "CANCELLED") throw new LessonError("The lesson is cancelled; restore it first");
  const policy = await policyOf(db, lesson.organizationId);
  const percent = opts.chargePercent ?? policy.noShowChargePercent;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new LessonError("Charge percent must be 0 to 100");
  await db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: lessonId }, data: { status: "NO_SHOW" } });
    await tx.lessonStudent.updateMany({ where: { lessonId }, data: { status: "NO_SHOW" } });
    await applyChargePercent(tx, lesson.students, percent, "no-show", lesson.subject, lesson.durationMin, lesson.students.length);
  });
  for (const accountId of new Set(lesson.students.map((s) => s.student.accountId))) {
    await rebuildAccountAllocations(db, accountId);
  }
  return { chargePercent: percent };
}

/**
 * A make-up credit: a negative adjustment on the family account for what a
 * cancelled or missed lesson was charged, pointing back at that lesson. One
 * per student per lesson. Returns how many were made.
 */
export async function issueMakeupCredit(db: Db, lessonId: string, opts: { reason?: string } = {}) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { organization: { select: { timezone: true } }, students: { include: { charge: true, student: { select: { id: true, accountId: true } } } }, makeupCredits: { where: { voidedAt: null }, select: { studentId: true } } },
  });
  if (!lesson || lesson.deletedAt) throw new LessonError("Lesson not found");
  if (lesson.status !== "CANCELLED" && lesson.status !== "NO_SHOW") throw new LessonError("Make-up credits are for cancelled or missed lessons");
  const already = new Set(lesson.makeupCredits.map((c) => c.studentId));
  const day = localDateOnly(new Date(), lesson.organization.timezone);
  let made = 0;
  for (const seat of lesson.students) {
    if (!seat.charge || seat.charge.voidedAt || seat.charge.amountCents <= 0 || already.has(seat.studentId)) continue;
    await db.charge.create({
      data: {
        organizationId: lesson.organizationId, accountId: seat.student.accountId, studentId: seat.studentId, kind: "ADJUSTMENT",
        amountCents: -seat.charge.amountCents, chargedOn: day, sourceLessonId: lesson.id,
        description: `Make-up credit${opts.reason ? `, ${opts.reason.toLowerCase()}` : ""}: ${lesson.subject} on ${localDateStr(lesson.startsAt, lesson.organization.timezone)}`,
      },
    });
    made++;
  }
  for (const accountId of new Set(lesson.students.map((s) => s.student.accountId))) await rebuildAccountAllocations(db, accountId);
  return made;
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
    // The charge comes back at the full price, whatever the cancellation policy took off.
    for (const seat of lesson.students) {
      if (seat.charge) {
        await tx.charge.update({ where: { id: seat.charge.id }, data: { voidedAt: null, voidReason: null, amountCents: seat.priceCents, description: chargeDescription(lesson.subject, lesson.durationMin, lesson.students.length) } });
      }
    }
    // A make-up credit for a lesson that is back on is no longer owed.
    await tx.charge.updateMany({ where: { sourceLessonId: lessonId, voidedAt: null }, data: { voidedAt: new Date(), voidReason: "Lesson restored" } });
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
