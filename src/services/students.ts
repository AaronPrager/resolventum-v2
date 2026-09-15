/**
 * Student queries for the students list and the student page.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export interface StudentRow {
  id: string;
  name: string;
  grade: string | null;
  status: "ACTIVE" | "PAUSED";
  archived: boolean;
  accountId: string;
  accountName: string;
  balanceCents: number;
  lastLessonAt: Date | null;
  nextLessonAt: Date | null;
  lessonCount: number;
}

/** `today` is a calendar day in the school's zone (see localDateOnly); the database session zone is not trusted. */
export async function listStudents(prisma: PrismaClient, organizationId: string, today: Date, opts: { includeArchived?: boolean; tutorId?: string | null } = {}): Promise<StudentRow[]> {
  const todayStr = today.toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<
    { id: string; firstName: string; lastName: string; grade: string | null; status: "ACTIVE" | "PAUSED"; archivedAt: Date | null; accountId: string; accountName: string;
      balance: bigint; lastLessonAt: Date | null; nextLessonAt: Date | null; lessonCount: bigint }[]
  >`
    select s.id, s."firstName", s."lastName", s.grade, s.status::text as status, s."archivedAt", s."accountId", a.name as "accountName",
      coalesce((select sum(c."amountCents") from "Charge" c where c."accountId" = a.id and c."voidedAt" is null and c."chargedOn" <= ${todayStr}::date), 0)::bigint
      - coalesce((select sum(p."amountCents") from "Payment" p where p."accountId" = a.id and p."voidedAt" is null and p."paidOn" <= ${todayStr}::date), 0)::bigint as balance,
      (select max(l."startsAt") from "LessonStudent" ls join "Lesson" l on l.id = ls."lessonId"
        where ls."studentId" = s.id and l."deletedAt" is null and l.status <> 'CANCELLED' and l."startsAt" <= now()) as "lastLessonAt",
      (select min(l."startsAt") from "LessonStudent" ls join "Lesson" l on l.id = ls."lessonId"
        where ls."studentId" = s.id and l."deletedAt" is null and l.status <> 'CANCELLED' and l."startsAt" > now()) as "nextLessonAt",
      (select count(*) from "LessonStudent" ls join "Lesson" l on l.id = ls."lessonId"
        where ls."studentId" = s.id and l."deletedAt" is null and l.status <> 'CANCELLED')::bigint as "lessonCount"
    from "Student" s join "Account" a on a.id = s."accountId"
    where s."organizationId" = ${organizationId} and s."deletedAt" is null
      and (${opts.includeArchived ?? false} or s."archivedAt" is null)
      and (${opts.tutorId ?? null}::text is null or exists (select 1 from "LessonStudent" x join "Lesson" xl on xl.id = x."lessonId" where x."studentId" = s.id and xl."tutorId" = ${opts.tutorId ?? null}::text and xl."deletedAt" is null))
    order by s."lastName", s."firstName"`;
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    grade: r.grade,
    status: r.status,
    archived: r.archivedAt !== null,
    accountId: r.accountId,
    accountName: r.accountName,
    balanceCents: Number(r.balance),
    lastLessonAt: r.lastLessonAt,
    nextLessonAt: r.nextLessonAt,
    lessonCount: Number(r.lessonCount),
  }));
}

export async function studentDetail(prisma: PrismaClient, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      organization: { select: { id: true, timezone: true } },
      account: { include: { guardians: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, students: { where: { deletedAt: null } } } },
      progressNotes: { orderBy: { notedOn: "desc" }, take: 20 },
      assignments: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 10, include: { _count: { select: { submissions: true } } } },
      lessons: {
        where: { lesson: { deletedAt: null } },
        include: { lesson: { include: { tutor: { select: { id: true, name: true, color: true } } } }, charge: { select: { amountCents: true, voidedAt: true } } },
        orderBy: { lesson: { startsAt: "desc" } },
      },
    },
  });
  if (!student || student.deletedAt) return null;
  const tutors = await prisma.tutor.findMany({ where: { organizationId: student.organizationId, archivedAt: null }, orderBy: { name: "asc" } });
  return { student, tutors };
}

export type StudentDetail = NonNullable<Awaited<ReturnType<typeof studentDetail>>>;

export class StudentError extends Error {}

/**
 * Stop a student's future: every scheduled solo lesson from now on is
 * cancelled with the charge released, and a weekly series that only they were
 * in ends today. Group lessons go on for the others. Used by archive and pause.
 */
export async function stopFutureLessons(db: PrismaClient, studentId: string, reason: string, now = new Date()): Promise<{ cancelledLessons: number; endedSeries: number }> {
  const seats = await db.lessonStudent.findMany({
    where: { studentId, lesson: { startsAt: { gt: now }, status: "SCHEDULED", deletedAt: null } },
    include: { lesson: { select: { id: true, seriesId: true, _count: { select: { students: true } } } } },
  });
  const { cancelLesson } = await import("./lessons");
  let cancelledLessons = 0;
  const seriesIds = new Set<string>();
  for (const seat of seats) {
    if (seat.lesson._count.students > 1) continue; // a group lesson goes on for the others
    await cancelLesson(db, seat.lesson.id, reason, { chargeAnyway: false });
    cancelledLessons += 1;
    if (seat.lesson.seriesId) seriesIds.add(seat.lesson.seriesId);
  }
  let endedSeries = 0;
  for (const seriesId of seriesIds) {
    const stillScheduled = await db.lesson.count({ where: { seriesId, status: "SCHEDULED", startsAt: { gt: now }, deletedAt: null } });
    if (stillScheduled > 0) continue;
    await db.lessonSeries.update({ where: { id: seriesId }, data: { endsOn: new Date(now.toISOString().slice(0, 10)) } });
    endedSeries += 1;
  }
  return { cancelledLessons, endedSeries };
}

/**
 * Archive a student: they leave the pickers and the default list, every
 * scheduled lesson of theirs from now on is cancelled (charges voided), and a
 * weekly series that only they were in stops today. History and balance stay.
 */
export async function archiveStudent(db: PrismaClient, organizationId: string, studentId: string, now = new Date()): Promise<{ cancelledLessons: number; endedSeries: number }> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!student) throw new StudentError("Student not found");
  if (student.archivedAt) return { cancelledLessons: 0, endedSeries: 0 };
  const r = await stopFutureLessons(db, studentId, "Student archived", now);
  await db.student.update({ where: { id: studentId }, data: { archivedAt: now } });
  return r;
}

export type StudentStatus = "ACTIVE" | "PAUSED";

/**
 * Change a student's status. Going from active to paused stops
 * their future lessons the way archiving does; they stay on the list and the
 * page, only out of the pickers. Coming back to active restores nothing: the
 * owner books the next lesson or series by hand.
 */
export async function setStudentStatus(db: PrismaClient, organizationId: string, studentId: string, status: StudentStatus, now = new Date()): Promise<{ changed: boolean; cancelledLessons: number; endedSeries: number }> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!student) throw new StudentError("Student not found");
  if (student.status === status) return { changed: false, cancelledLessons: 0, endedSeries: 0 };
  const stopped = status === "ACTIVE" ? { cancelledLessons: 0, endedSeries: 0 } : await stopFutureLessons(db, studentId, "Student paused", now);
  await db.student.update({ where: { id: studentId }, data: { status } });
  return { changed: true, ...stopped };
}

export type StudentState = "ACTIVE" | "PAUSED" | "ARCHIVED";

/** How a student stands, as one word: archived wins over the status column. */
export function studentState(s: { status: StudentStatus; archivedAt: Date | null }): StudentState {
  return s.archivedAt ? "ARCHIVED" : s.status;
}

/**
 * The one way to move a student between active, paused, and archived.
 * Leaving active stops their future lessons; coming back restores nothing.
 */
export async function setStudentState(db: PrismaClient, organizationId: string, studentId: string, state: StudentState, now = new Date()): Promise<{ changed: boolean; from: StudentState; cancelledLessons: number; endedSeries: number }> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!student) throw new StudentError("Student not found");
  const from = studentState(student);
  if (from === state) return { changed: false, from, cancelledLessons: 0, endedSeries: 0 };
  if (state === "ARCHIVED") return { changed: true, from, ...(await archiveStudent(db, organizationId, studentId, now)) };
  if (student.archivedAt) await db.student.update({ where: { id: studentId }, data: { archivedAt: null } });
  const r = await setStudentStatus(db, organizationId, studentId, state, now);
  return { changed: true, from, cancelledLessons: r.cancelledLessons, endedSeries: r.endedSeries };
}

export interface ArchiveCandidate { id: string; name: string; lastLessonAt: Date | null; balanceCents: number }

/**
 * Active students who look dormant: no lesson taught in `days` days, nothing
 * scheduled ahead, and on the books longer than that. The dashboard shows
 * them so the owner can pause or archive by hand.
 */
export async function archiveCandidates(db: PrismaClient, organizationId: string, now = new Date(), days = 60): Promise<ArchiveCandidate[]> {
  const since = new Date(now.getTime() - days * 86400000);
  const todayStr = now.toISOString().slice(0, 10);
  const rows = await db.$queryRaw<{ id: string; firstName: string; lastName: string; lastLessonAt: Date | null; balance: bigint }[]>`
    select s.id, s."firstName", s."lastName",
      (select max(l."startsAt") from "LessonStudent" ls join "Lesson" l on l.id = ls."lessonId"
        where ls."studentId" = s.id and l."deletedAt" is null and l.status not in ('CANCELLED', 'NO_SHOW')) as "lastLessonAt",
      coalesce((select sum(c."amountCents") from "Charge" c where c."accountId" = s."accountId" and c."voidedAt" is null and c."chargedOn" <= ${todayStr}::date), 0)::bigint
      - coalesce((select sum(p."amountCents") from "Payment" p where p."accountId" = s."accountId" and p."voidedAt" is null and p."paidOn" <= ${todayStr}::date), 0)::bigint as balance
    from "Student" s
    where s."organizationId" = ${organizationId} and s."deletedAt" is null and s."archivedAt" is null and s.status = 'ACTIVE'
      and s."createdAt" < ${since}
      and not exists (select 1 from "LessonStudent" ls join "Lesson" l on l.id = ls."lessonId"
        where ls."studentId" = s.id and l."deletedAt" is null and l.status <> 'CANCELLED' and l."startsAt" >= ${since})
    order by "lastLessonAt" asc nulls first, s."lastName", s."firstName"`;
  return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, lastLessonAt: r.lastLessonAt, balanceCents: Number(r.balance) }));
}

/** Bring an archived student back. Cancelled lessons stay cancelled; restore the ones you want. */
export async function unarchiveStudent(db: PrismaClient, organizationId: string, studentId: string): Promise<void> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!student) throw new StudentError("Student not found");
  await db.student.update({ where: { id: studentId }, data: { archivedAt: null } });
}

/** Students for the lesson form's pickers: active ones only (not paused or archived), last name first, with their usual price and subject. */
export async function studentChoices(db: PrismaClient, organizationId: string, include: string[] = []) {
  const rows = await db.student.findMany({
    where: { organizationId, deletedAt: null, OR: [{ archivedAt: null, status: "ACTIVE" }, { id: { in: include } }] },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, defaultPriceCents: true, defaultSubject: true },
  });
  return rows.map((s) => ({
    id: s.id,
    name: `${s.lastName}, ${s.firstName}`,
    defaultPrice: s.defaultPriceCents != null ? (s.defaultPriceCents / 100).toFixed(2) : "",
    defaultSubject: s.defaultSubject ?? undefined,
  }));
}
