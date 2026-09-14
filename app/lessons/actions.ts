"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireSession, requireWriter } from "@/src/auth/current";
import { zonedToUtc } from "@/src/lib/tz";
import { LessonError, cancelLesson, createLesson, deleteLesson, restoreLesson, updateLesson } from "@/src/services/lessons";
import { cancelLessonAndFuture, createSeries, deleteLessonAndFuture, updateLessonAndFuture } from "@/src/services/series";

export interface ActionState {
  error?: string;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function dollarsToCents(s: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
/** Same check by lesson, for events that have no student. */
async function lessonTimezone(lessonId: string): Promise<string> {
  const session = await requireWriter();
  const l = await prisma.lesson.findFirst({ where: { id: lessonId, organizationId: session.organizationId }, select: { id: true } });
  if (!l) throw new LessonError("Lesson not found");
  return session.timezone;
}

function readLessonForm(fd: FormData, timeZone: string) {
  const date = str(fd, "date");
  const allDay = str(fd, "allDay") === "on";
  const time = allDay ? "00:00" : str(fd, "time");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new LessonError("Date and time are required");
  // The roster: parallel lists of student and price, one pair per row.
  const ids = fd.getAll("seatStudentId").map((v) => String(v).trim());
  const prices = fd.getAll("seatPrice").map((v) => String(v).trim());
  const seats = ids.map((studentId, i) => {
    if (!studentId) throw new LessonError("Pick a student for every row, or remove the empty row");
    const priceCents = dollarsToCents(prices[i] ?? "");
    if (Number.isNaN(priceCents)) throw new LessonError("Price must be a number like 130 or 130.00");
    return { studentId, priceCents };
  });
  const location = str(fd, "locationType");
  const category = str(fd, "category");
  return {
    startsAt: zonedToUtc(date, time, timeZone),
    allDay,
    durationMin: allDay ? 1440 : Number(str(fd, "durationMin")),
    subject: str(fd, "subject"),
    seats,
    priceCents: 0,
    tutorId: str(fd, "tutorId") || null,
    locationType: (location === "REMOTE" ? "REMOTE" : "IN_PERSON") as "REMOTE" | "IN_PERSON",
    meetingLink: str(fd, "meetingLink") || null,
    notes: str(fd, "notes") || null,
    category: (category === "TUTORING" || category === "COLLEGE_COUNSELING" ? category : null) as "TUTORING" | "COLLEGE_COUNSELING" | null,
  };
}

export async function createLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const repeat = str(fd, "repeat") === "on";
  const firstStudent = fd.getAll("seatStudentId").map(String).find(Boolean) ?? null;
  const returnTo = str(fd, "returnTo") || (firstStudent ? `/students/${firstStudent}` : "/calendar");
  try {
    const session = await requireWriter();
    const input = readLessonForm(fd, session.timezone);
    const owner = { organizationId: session.organizationId };
    if (repeat) {
      const intervalWeeks = Number(str(fd, "intervalWeeks") || "1");
      const until = str(fd, "until") || null;
      await createSeries(prisma, { ...owner, ...input, intervalWeeks, until });
    } else {
      await createLesson(prisma, { ...owner, ...input });
    }
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  revalidatePath("/students", "layout");
  revalidatePath("/calendar");
  redirect(returnTo);
}

export async function updateLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId") || (fd.getAll("seatStudentId").map(String).find(Boolean) ?? "");
  const scope = str(fd, "scope") === "future" ? "future" : "one";
  try {
    const tz = await lessonTimezone(lessonId);
    const input = readLessonForm(fd, tz);
    if (scope === "future") await updateLessonAndFuture(prisma, lessonId, input, tz);
    else await updateLesson(prisma, lessonId, input);
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  if (studentId) revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  redirect(str(fd, "returnTo") || (studentId ? `/students/${studentId}` : "/calendar"));
}

export async function cancelLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const reason = str(fd, "reason") || "Cancelled";
  const tz = await lessonTimezone(lessonId);
  if (str(fd, "scope") === "future") {
    await cancelLessonAndFuture(prisma, lessonId, reason, tz);
  } else {
    await cancelLesson(prisma, lessonId, reason, { chargeAnyway: str(fd, "chargeAnyway") === "on" });
  }
  if (studentId) revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  const returnTo = str(fd, "returnTo");
  if (returnTo) redirect(returnTo);
}

export async function restoreLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  await lessonTimezone(lessonId);
  await restoreLesson(prisma, lessonId);
  if (studentId) revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
}

/** Called from the calendar after the user confirms. Returns an error message instead of throwing. */
export async function deleteLessonAction(lessonId: string, scope: "one" | "future"): Promise<ActionState> {
  try {
    const tz = await lessonTimezone(lessonId);
    if (scope === "future") await deleteLessonAndFuture(prisma, lessonId, tz);
    else await deleteLesson(prisma, lessonId);
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  revalidatePath("/calendar");
  revalidatePath("/students");
  revalidatePath("/accounts");
  return {};
}
