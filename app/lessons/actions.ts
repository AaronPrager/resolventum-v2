"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { zonedToUtc } from "@/src/lib/tz";
import { formatCents } from "@/src/lib/format";
import { LessonError, cancelLesson, createLesson, deleteLesson, issueMakeupCredit, markNoShow, restoreLesson, updateLesson } from "@/src/services/lessons";
import { CategoryError } from "@/src/services/lessonCategories";
import { cancelLessonAndFuture, createSeries, deleteLessonAndFuture, updateLessonAndFuture } from "@/src/services/series";
import { auditAs } from "@/src/services/audit";

export interface ActionState {
  error?: string;
  ok?: string;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function dollarsToCents(s: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
/** The signed-in writer and the lesson, checked to be theirs. */
async function ownedLesson(lessonId: string) {
  const session = await requireWriter();
  const l = await prisma.lesson.findFirst({ where: { id: lessonId, organizationId: session.organizationId }, select: { id: true, subject: true, startsAt: true, students: { select: { student: { select: { firstName: true, lastName: true } } } } } });
  if (!l) throw new LessonError("Lesson not found");
  const who = l.students.map((s) => `${s.student.firstName} ${s.student.lastName}`).join(", ");
  return { session, tz: session.timezone, lesson: l, label: `${who ? `${who}, ` : ""}${l.subject} on ${l.startsAt.toISOString().slice(0, 10)}` };
}
/** Same check by lesson, for callers that only need the zone. */
async function lessonTimezone(lessonId: string): Promise<string> {
  return (await ownedLesson(lessonId)).tz;
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
    categoryId: str(fd, "categoryId") || null,
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
      const r = await createSeries(prisma, { ...owner, ...input, intervalWeeks, until, skipHolidays: str(fd, "skipHolidays") === "on" }, session.userId);
      await auditAs(prisma, session, { action: "lesson.series.create", subjectType: "lesson", subjectId: r.series.id, summary: `${r.lessonIds.length} weekly ${input.subject} lessons` });
    } else {
      const l = await createLesson(prisma, { ...owner, ...input }, session.userId);
      await auditAs(prisma, session, { action: "lesson.create", subjectType: "lesson", subjectId: l.id, summary: `${input.subject}, ${input.seats.length} student${input.seats.length === 1 ? "" : "s"}, ${formatCents(input.seats.reduce((s, x) => s + x.priceCents, 0))}` });
    }
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError || e instanceof CategoryError) return { error: e.message };
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
    const { session, tz, label } = await ownedLesson(lessonId);
    const input = readLessonForm(fd, tz);
    if (scope === "future") await updateLessonAndFuture(prisma, lessonId, input, tz);
    else await updateLesson(prisma, lessonId, input);
    await auditAs(prisma, session, { action: "lesson.update", subjectType: "lesson", subjectId: lessonId, summary: `${label}${scope === "future" ? ", and later lessons in the series" : ""}` });
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError || e instanceof CategoryError) return { error: e.message };
    throw e;
  }
  if (studentId) revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  redirect(str(fd, "returnTo") || (studentId ? `/students/${studentId}` : "/calendar"));
}

function refreshLesson(studentId: string) {
  if (studentId) revalidatePath(`/students/${studentId}`);
  revalidatePath("/calendar");
  revalidatePath("/accounts", "layout");
  revalidatePath("/");
}

/**
 * Cancel. `chargeMode` is "policy" (the school's rule decides by how late it
 * is), "charge" (keep the full charge), or "waive" (void it). Old forms with
 * the "chargeAnyway" box still work.
 */
export async function cancelLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const reason = str(fd, "reason") || "Cancelled";
  const mode = str(fd, "chargeMode") || (str(fd, "chargeAnyway") === "on" ? "charge" : "policy");
  const opts = mode === "charge" ? { chargeAnyway: true } : mode === "waive" ? { chargeAnyway: false } : {};
  const { session, tz, label } = await ownedLesson(lessonId);
  if (str(fd, "scope") === "future") {
    const n = await cancelLessonAndFuture(prisma, lessonId, reason, tz, opts);
    await auditAs(prisma, session, { action: "lesson.cancel", subjectType: "lesson", subjectId: lessonId, summary: `${label} and ${n - 1} later in the series: ${reason}` });
  } else {
    const r = await cancelLesson(prisma, lessonId, reason, opts);
    await auditAs(prisma, session, { action: "lesson.cancel", subjectType: "lesson", subjectId: lessonId, summary: `${label}: ${reason}. ${r.chargePercent === 0 ? "Not charged" : `Charged ${r.chargePercent}%`}${r.late ? " (late)" : ""}${r.makeupCredits ? `, ${r.makeupCredits} make-up credit` : ""}` });
  }
  refreshLesson(studentId);
  const returnTo = str(fd, "returnTo");
  if (returnTo) redirect(returnTo);
}

export async function restoreLessonAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const { session, label } = await ownedLesson(lessonId);
  await restoreLesson(prisma, lessonId);
  await auditAs(prisma, session, { action: "lesson.restore", subjectType: "lesson", subjectId: lessonId, summary: label });
  refreshLesson(studentId);
}

export async function markNoShowAction(fd: FormData): Promise<void> {
  const lessonId = str(fd, "lessonId");
  const studentId = str(fd, "studentId");
  const { session, label } = await ownedLesson(lessonId);
  const r = await markNoShow(prisma, lessonId);
  await auditAs(prisma, session, { action: "lesson.noShow", subjectType: "lesson", subjectId: lessonId, summary: `${label}: no-show, charged ${r.chargePercent}%` });
  refreshLesson(studentId);
  const returnTo = str(fd, "returnTo");
  if (returnTo) redirect(returnTo);
}

export async function issueMakeupAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const lessonId = str(fd, "lessonId");
  try {
    const { session, label } = await ownedLesson(lessonId);
    const n = await issueMakeupCredit(prisma, lessonId, { reason: str(fd, "reason") || undefined });
    if (n === 0) return { error: "Nothing to credit: the lesson was not charged, or a credit already exists" };
    await auditAs(prisma, session, { action: "credit.makeup", subjectType: "lesson", subjectId: lessonId, summary: `${n} make-up credit${n === 1 ? "" : "s"} for ${label}` });
    refreshLesson(str(fd, "studentId"));
    revalidatePath(`/lessons/${lessonId}`);
    return { ok: `${n} make-up credit${n === 1 ? "" : "s"} put on the account` };
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError || e instanceof CategoryError) return { error: e.message };
    throw e;
  }
}

/** Called from the calendar after the user confirms. Returns an error message instead of throwing. */
export async function deleteLessonAction(lessonId: string, scope: "one" | "future"): Promise<ActionState> {
  try {
    const { session, tz, label } = await ownedLesson(lessonId);
    if (scope === "future") await deleteLessonAndFuture(prisma, lessonId, tz);
    else await deleteLesson(prisma, lessonId);
    await auditAs(prisma, session, { action: "lesson.delete", subjectType: "lesson", subjectId: lessonId, summary: `${label}${scope === "future" ? " and later lessons in the series" : ""}` });
  } catch (e) {
    if (e instanceof LessonError || e instanceof RoleError || e instanceof CategoryError) return { error: e.message };
    throw e;
  }
  revalidatePath("/calendar");
  revalidatePath("/students");
  revalidatePath("/accounts");
  return {};
}

// ---------------------------------------------------------------- session notes

