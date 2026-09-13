"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireSession, requireWriter } from "@/src/auth/current";
import { zonedToUtc } from "@/src/lib/tz";
import { LessonError, cancelLesson, createLesson, restoreLesson, updateLesson } from "@/src/services/lessons";
import { cancelLessonAndFuture, createSeries, updateLessonAndFuture } from "@/src/services/series";

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
/** The signed-in organization's timezone, after checking the student belongs to it. */
async function orgTimezone(studentId: string): Promise<string> {
  const session = await requireWriter();
  const s = await prisma.student.findFirst({ where: { id: studentId, organizationId: session.organizationId }, select: { id: true } });
  if (!s) throw new LessonError("Student not found");
  return session.timezone;
}

function readLessonForm(fd: FormData, timeZone: string) {
  const date = str(fd, "date");
  const time = str(fd, "time");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new LessonError("Date and time are required");
  const priceCents = dollarsToCents(str(fd, "price"));
  if (Number.isNaN(priceCents)) throw new LessonError("Price must be a number like 130 or 130.00");
  const location = str(fd, "locationType");
  const category = str(fd, "category");
  return {
    startsAt: zonedToUtc(date, time, timeZone),
    durationMin: Number(str(fd, "durationMin")),
    subject: str(fd, "subject"),
    priceCents,
    tutorId: str(fd, "tutorId") || null,
    locationType: (location === "REMOTE" ? "REMOTE" : "IN_PERSON") as "REMOTE" | "IN_PERSON",
    meetingLink: str(fd, "meetingLink") || null,
    notes: str(fd, "notes") || null,
    category: (category === "TUTORING" || category === "COLLEGE_COUNSELING" ? category : null) as "TUTORING" | "COLLEGE_COUNSELING" | null,
  };
}

export async function createLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  if (!studentId) return { error: "Pick a student" };
  const repeat = str(fd, "repeat") === "on";
  const returnTo = str(fd, "returnTo") || `/students/${studentId}`;
  try {
    const input = readLessonForm(fd, await orgTimezone(studentId));
    if (repeat) {
      const intervalWeeks = Number(str(fd, "intervalWeeks") || "1");
      const until = str(fd, "until") || null;
      await createSeries(prisma, { studentId, ...input, intervalWeeks, until });
    } else {
      await createLesson(prisma, { studentId, ...input });
    }
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  redirect(returnTo);
}

export async function updateLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const scope = str(fd, "scope") === "future" ? "future" : "one";
  try {
    const tz = await orgTimezone(studentId);
    const input = readLessonForm(fd, tz);
    if (scope === "future") await updateLessonAndFuture(prisma, lessonId, input, tz);
    else await updateLesson(prisma, lessonId, input);
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  redirect(str(fd, "returnTo") || `/students/${studentId}`);
}

export async function cancelLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const reason = str(fd, "reason") || "Cancelled";
  const tz = await orgTimezone(studentId);
  if (str(fd, "scope") === "future") {
    await cancelLessonAndFuture(prisma, lessonId, reason, tz);
  } else {
    await cancelLesson(prisma, lessonId, reason, { chargeAnyway: str(fd, "chargeAnyway") === "on" });
  }
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  const returnTo = str(fd, "returnTo");
  if (returnTo) redirect(returnTo);
}

export async function restoreLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  await orgTimezone(studentId);
  await restoreLesson(prisma, lessonId);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
}
