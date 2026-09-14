/**
 * Lessons for a calendar range, one row per lesson with its seats.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { localDateStr } from "../lib/tz";

export interface CalendarLesson {
  id: string;
  startsAt: Date;
  endsAt: Date;
  durationMin: number;
  allDay: boolean;
  subject: string;
  status: string;
  locationType: string;
  seriesId: string | null;
  tutor: { id: string; name: string; color: string | null } | null;
  students: { id: string; name: string; priceCents: number }[];
  /** "YYYY-MM-DD" in the organization's zone. */
  day: string;
}

export async function calendarLessons(prisma: PrismaClient, organizationId: string, from: Date, to: Date, timeZone: string): Promise<CalendarLesson[]> {
  const rows = await prisma.lesson.findMany({
    where: { organizationId, deletedAt: null, startsAt: { gte: from, lt: to } },
    include: {
      tutor: { select: { id: true, name: true, color: true } },
      students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((l) => ({
    id: l.id,
    startsAt: l.startsAt,
    endsAt: new Date(l.startsAt.getTime() + l.durationMin * 60000),
    durationMin: l.durationMin,
    allDay: l.allDay,
    subject: l.subject,
    status: l.status,
    locationType: l.locationType,
    seriesId: l.seriesId,
    tutor: l.tutor,
    students: l.students.map((s) => ({ id: s.student.id, name: `${s.student.firstName} ${s.student.lastName}`, priceCents: s.priceCents })),
    day: localDateStr(l.startsAt, timeZone),
  }));
}
