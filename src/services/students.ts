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
      assignments: { orderBy: { createdAt: "desc" }, take: 10, include: { _count: { select: { submissions: true } } } },
      lessons: {
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
