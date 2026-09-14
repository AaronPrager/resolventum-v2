/**
 * Recurring lesson series. A series is a rule plus real Lesson rows generated
 * ahead of time, each with its own seat and charge, so every other part of
 * the app sees ordinary lessons.
 *
 * A series with no end date is generated HORIZON_DAYS ahead and extended by
 * extendOpenSeries(), which is safe to call any time (a cron job later).
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr, localDateOnly, localDateStr, localTimeStr, zonedToUtc } from "../lib/tz";
import { formatRule, parseRule, weeklyOccurrences, weeklyOccurrencesAfter } from "../lib/recurrence";
import { rebuildAccountAllocations } from "./allocation";
import { LessonError, type LessonInput, type LessonUpdate, cancelLesson, resolveOwner, updateLesson } from "./lessons";

export const HORIZON_DAYS = 180;

export interface SeriesInput extends LessonInput {
  intervalWeeks?: number;
  /** "YYYY-MM-DD" in the organization's zone, inclusive. Null = open-ended. */
  until?: string | null;
}

function horizonDateStr(timeZone: string, from = new Date()): string {
  return localDateStr(new Date(from.getTime() + HORIZON_DAYS * 86400000), timeZone);
}

/** Create the series and every lesson up to `until` or the horizon. Returns the series and the lessons made. */
export async function createSeries(db: PrismaClient, input: SeriesInput, createdById?: string | null) {
  const intervalWeeks = input.intervalWeeks ?? 1;
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 52) throw new LessonError("Repeat interval must be 1 to 52 weeks");
  if (input.until && !/^\d{4}-\d{2}-\d{2}$/.test(input.until)) throw new LessonError("Repeat-until must be a date");
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new LessonError("Start time is not valid");
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0 || input.durationMin > 1440) throw new LessonError("Duration must be between 1 and 1440 minutes");
  if (input.allDay) input = { ...input, durationMin: 1440 };
  if (!input.subject.trim()) throw new LessonError(input.studentId ? "Subject is required" : "A title is required for an event with no student");
  if (input.studentId && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) throw new LessonError("Price must be zero or more");

  const { student, organizationId, timezone: tz } = await resolveOwner(db, input);
  const firstDate = localDateStr(input.startsAt, tz);
  if (input.until && input.until < firstDate) throw new LessonError("Repeat-until is before the first lesson");

  const genUntil = input.until ?? horizonDateStr(tz, input.startsAt > new Date() ? input.startsAt : new Date());
  const occurrences = weeklyOccurrences({ firstStartsAt: input.startsAt, timeZone: tz, intervalWeeks, until: genUntil });
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const series = await tx.lessonSeries.create({
      data: {
        organizationId,
        rrule: formatRule({ intervalWeeks }),
        startsAt: input.startsAt,
        endsOn: input.until ? dateOnlyFromStr(input.until) : null,
      },
    });
    const ids: string[] = [];
    for (const startsAt of occurrences) {
      const status = startsAt <= now ? "COMPLETED" : "SCHEDULED";
      const lesson = await tx.lesson.create({
        data: {
          organizationId,
          tutorId: input.tutorId ?? null,
          seriesId: series.id,
          startsAt,
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
      ids.push(lesson.id);
      if (!student) continue;
      const seat = await tx.lessonStudent.create({ data: { lessonId: lesson.id, studentId: student.id, priceCents: input.priceCents, status } });
      await tx.charge.create({
        data: {
          organizationId,
          accountId: student.accountId,
          studentId: student.id,
          lessonStudentId: seat.id,
          kind: "LESSON",
          amountCents: input.priceCents,
          chargedOn: localDateOnly(startsAt, tz),
          description: `${input.subject.trim()}, ${input.durationMin} min`,
        },
      });
    }
    return { series, lessonIds: ids };
  });
  if (student) await rebuildAccountAllocations(db, student.accountId);
  return result;
}

/**
 * Generate missing lessons for every open-ended series up to the horizon.
 * Copies subject, price, tutor, and the rest from the last lesson of the series.
 * Returns the number of lessons created.
 */
export async function extendOpenSeries(db: PrismaClient, organizationId: string, now = new Date()): Promise<number> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const until = horizonDateStr(org.timezone, now);
  const series = await db.lessonSeries.findMany({
    where: { organizationId, endsOn: null },
    include: { lessons: { where: { deletedAt: null }, orderBy: { startsAt: "desc" }, take: 1, include: { students: true } } },
  });
  let created = 0;
  const touchedAccounts = new Set<string>();
  for (const s of series) {
    const last = s.lessons[0];
    if (!last || last.students.length > 1) continue; // nothing to copy from, or a group series
    const seat = last.students[0] ?? null; // null: a repeating event with no student
    const student = seat ? await db.student.findUnique({ where: { id: seat.studentId }, select: { id: true, accountId: true, deletedAt: true, archivedAt: true } }) : null;
    if (seat && (!student || student.deletedAt || student.archivedAt)) continue;
    const { intervalWeeks } = parseRule(s.rrule);
    const dates = weeklyOccurrencesAfter({ firstStartsAt: s.startsAt, timeZone: org.timezone, intervalWeeks, after: last.startsAt, until });
    if (dates.length === 0) continue;
    await db.$transaction(async (tx) => {
      for (const startsAt of dates) {
        const lesson = await tx.lesson.create({
          data: {
            organizationId, tutorId: last.tutorId, seriesId: s.id, startsAt, durationMin: last.durationMin, allDay: last.allDay, subject: last.subject,
            category: last.category, locationType: last.locationType, meetingLink: last.meetingLink, status: "SCHEDULED",
          },
        });
        created++;
        if (!seat || !student) continue;
        const newSeat = await tx.lessonStudent.create({ data: { lessonId: lesson.id, studentId: student.id, priceCents: seat.priceCents, status: "SCHEDULED" } });
        await tx.charge.create({
          data: {
            organizationId, accountId: student.accountId, studentId: student.id, lessonStudentId: newSeat.id, kind: "LESSON",
            amountCents: seat.priceCents, chargedOn: localDateOnly(startsAt, org.timezone), description: `${last.subject}, ${last.durationMin} min`,
          },
        });
      }
    });
    if (student) touchedAccounts.add(student.accountId);
  }
  for (const accountId of touchedAccounts) await rebuildAccountAllocations(db, accountId);
  return created;
}

/** Lessons of the same series at or after the given one, not cancelled, not deleted. */
async function futureOfSeries(db: PrismaClient, lessonId: string) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, seriesId: true, startsAt: true } });
  if (!lesson) throw new LessonError("Lesson not found");
  if (!lesson.seriesId) return [lesson];
  return db.lesson.findMany({
    where: { seriesId: lesson.seriesId, startsAt: { gte: lesson.startsAt }, deletedAt: null, status: { notIn: ["CANCELLED"] } },
    select: { id: true, seriesId: true, startsAt: true },
    orderBy: { startsAt: "asc" },
  });
}

/**
 * Apply an edit to this lesson and every later one in its series. A new start
 * time moves each lesson's time of day and keeps its own date; a new date only
 * applies to this lesson.
 */
export async function updateLessonAndFuture(db: PrismaClient, lessonId: string, patch: LessonUpdate, timeZone: string) {
  const lessons = await futureOfSeries(db, lessonId);
  const first = lessons[0];
  const newTime = patch.startsAt ? { h: patch.startsAt.getTime() } : null;
  for (const l of lessons) {
    const p: LessonUpdate = { ...patch };
    if (newTime && l.id !== first.id) {
      // Keep this lesson's date, take the new local time of day.
      p.startsAt = zonedToUtc(localDateStr(l.startsAt, timeZone), localTimeStr(patch.startsAt!, timeZone), timeZone);
    }
    await updateLesson(db, l.id, p);
  }
  return lessons.length;
}

/** Cancel this lesson and every later one in its series, and close the series on this date. */
export async function cancelLessonAndFuture(db: PrismaClient, lessonId: string, reason: string, timeZone: string) {
  const lessons = await futureOfSeries(db, lessonId);
  for (const l of lessons) await cancelLesson(db, l.id, reason);
  const first = lessons[0];
  if (first.seriesId) {
    const dayBefore = new Date(localDateOnly(first.startsAt, timeZone).getTime() - 86400000);
    await db.lessonSeries.update({ where: { id: first.seriesId }, data: { endsOn: dayBefore } });
  }
  return lessons.length;
}
