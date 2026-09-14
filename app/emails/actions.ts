"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { EmailError } from "@/src/email/send";
import { localDateOnly } from "@/src/lib/tz";
import { sendBalanceReminders, sendDailySchedule, sendLessonReminders } from "@/src/services/reminders";

export interface ActionState { error?: string; ok?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
const summary = (r: { sent: number; skipped: number; failed: number; errors: string[] }, what: string) =>
  [`${r.sent} ${what}${r.sent === 1 ? "" : "s"} sent`, r.skipped ? `${r.skipped} skipped` : null, r.failed ? `${r.failed} failed: ${r.errors.join("; ")}` : null].filter(Boolean).join(", ");

export async function sendLessonRemindersAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requireWriter();
    const ids = fd.getAll("accountId").map(String);
    if (ids.length === 0) return { error: "Tick at least one family" };
    const r = await sendLessonReminders(prisma, s.organizationId, str(fd, "day"), { accountIds: ids });
    revalidatePath("/emails");
    return r.failed && !r.sent ? { error: summary(r, "reminder") } : { ok: summary(r, "reminder") };
  } catch (e) {
    if (e instanceof RoleError || e instanceof EmailError) return { error: e.message };
    throw e;
  }
}

export async function sendBalanceRemindersAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requireWriter();
    const ids = fd.getAll("accountId").map(String);
    if (ids.length === 0) return { error: "Tick at least one family" };
    const r = await sendBalanceReminders(prisma, s.organizationId, ids, localDateOnly(new Date(), s.timezone));
    revalidatePath("/emails");
    return r.failed && !r.sent ? { error: summary(r, "reminder") } : { ok: summary(r, "reminder") };
  } catch (e) {
    if (e instanceof RoleError || e instanceof EmailError) return { error: e.message };
    throw e;
  }
}

export async function sendScheduleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requireWriter();
    const r = await sendDailySchedule(prisma, s.organizationId, str(fd, "day"), str(fd, "to"));
    revalidatePath("/emails");
    return r.sent ? { ok: `Schedule sent to ${str(fd, "to")}` } : { error: r.reason };
  } catch (e) {
    if (e instanceof RoleError || e instanceof EmailError) return { error: e.message };
    throw e;
  }
}

export async function saveEmailSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requireWriter();
    const email = str(fd, "dailyScheduleEmail");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That schedule address does not look right" };
    await prisma.organization.update({
      where: { id: s.organizationId },
      data: { lessonRemindersAuto: fd.get("lessonRemindersAuto") === "on", dailyScheduleAuto: fd.get("dailyScheduleAuto") === "on", dailyScheduleEmail: email || null },
    });
    revalidatePath("/emails");
    return { ok: "Saved" };
  } catch (e) {
    if (e instanceof RoleError) return { error: e.message };
    throw e;
  }
}
