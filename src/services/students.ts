/**
 * Student queries for the students list and the student page.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export interface StudentRow {
  id: string;
  name: string;
  grade: string | null;
  archived: boolean;
  accountId: string;
  accountName: string;
  balanceCents: number;
  lastLessonAt: Date | null;
  nextLessonAt: Date | null;
  lessonCount: number;
}

/** `today` is a calendar day in the school's zone (see localDateOnly); the database session zone is not trusted. */
export async function listStudents(prisma: PrismaClient, organizationId: string, today: Date, opts: { includeArchived?: boolean } = {}): Promise<StudentRow[]> {
  const todayStr = today.toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<
    { id: string; firstName: string; lastName: string; grade: string | null; archivedAt: Date | null; accountId: string; accountName: string;
      balance: bigint; lastLessonAt: Date | null; nextLessonAt: Date | null; lessonCount: bigint }[]
  >`
    select s.id, s."firstName", s."lastName", s.grade, s."archivedAt", s."accountId", a.name as "accountName",
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
    order by s."lastName", s."firstName"`;
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    grade: r.grade,
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
 * Archive a student: they leave the pickers and the default list, every
 * scheduled lesson of theirs from now on is cancelled (charges voided), and a
 * weekly series that only they were in stops today. History and balance stay.
 */
export async function archiveStudent(db: PrismaClient, organizationId: string, studentId: string, now = new Date()): Promise<{ cancelledLessons: number; endedSeries: number }> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!student) throw new StudentError("Student not found");
  if (student.archivedAt) return { cancelledLessons: 0, endedSeries: 0 };

  const seats = await db.lessonStudent.findMany({
    where: { studentId, lesson: { startsAt: { gt: now }, status: "SCHEDULED", deletedAt: null } },
    include: { lesson: { select: { id: true, seriesId: true, _count: { select: { students: true } } } } },
  });
  const { cancelLesson } = await import("./lessons");
  let cancelledLessons = 0;
  const seriesIds = new Set<string>();
  for (const seat of seats) {
    if (seat.lesson._count.students > 1) continue; // a group lesson goes on for the others
    await cancelLesson(db, seat.lesson.id, "Student archived");
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
  await db.student.update({ where: { id: studentId }, data: { archivedAt: now } });
  return { cancelledLessons, endedSeries };
}

/** Bring an archived student back. Cancelled lessons stay cancelled; restore the ones you want. */
export async function unarchiveStudent(db: PrismaClient, organizationId: string, studentId: string): Promise<void> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!student) throw new StudentError("Student not found");
  await db.student.update({ where: { id: studentId }, data: { archivedAt: null } });
}

/** Students for the lesson form's pickers: active ones, last name first, with their usual price and subject. */
export async function studentChoices(db: PrismaClient, organizationId: string, include: string[] = []) {
  const rows = await db.student.findMany({
    where: { organizationId, deletedAt: null, OR: [{ archivedAt: null }, { id: { in: include } }] },
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
