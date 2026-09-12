"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { zonedToUtc } from "@/src/lib/tz";
import { LessonError, cancelLesson, createLesson, restoreLesson, updateLesson } from "@/src/services/lessons";

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
async function orgTimezone(studentId: string): Promise<string> {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { organization: { select: { timezone: true } } } });
  return s?.organization.timezone ?? "America/New_York";
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
  try {
    const input = readLessonForm(fd, await orgTimezone(studentId));
    await createLesson(prisma, { studentId, ...input });
  } catch (e) {
    if (e instanceof LessonError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
}

export async function updateLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  try {
    const input = readLessonForm(fd, await orgTimezone(studentId));
    await updateLesson(prisma, lessonId, input);
  } catch (e) {
    if (e instanceof LessonError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
}

export async function cancelLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const reason = str(fd, "reason") || "Cancelled";
  await cancelLesson(prisma, lessonId, reason, { chargeAnyway: str(fd, "chargeAnyway") === "on" });
  revalidatePath(`/students/${studentId}`);
}

export async function restoreLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  await restoreLesson(prisma, lessonId);
  revalidatePath(`/students/${studentId}`);
}
