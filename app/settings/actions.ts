"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { requireSession, requireWriter } from "@/src/auth/current";
import { AccountError, changePassword } from "@/src/auth/account";
import { issueFeedToken, revokeFeedToken } from "@/src/services/calendarFeed";
import { removeLogo, setLogo } from "@/src/services/branding";
import { FileError } from "@/src/services/files";
import { disableIntake, enableIntake } from "@/src/services/intake";
import { HolidayError, addHoliday, removeHoliday } from "@/src/services/holidays";
import { auditAs } from "@/src/services/audit";
import { AvailabilityError, parseAvailability } from "@/src/lib/availability";
import { CategoryError, addLessonCategory, deleteLessonCategory, renameLessonCategory, setLessonCategoryArchived } from "@/src/services/lessonCategories";

export interface FeedState { url?: string; error?: string }
export interface ActionState { error?: string; ok?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };

async function membershipId(): Promise<string> {
  const s = await requireSession();
  const m = await prisma.membership.findFirstOrThrow({ where: { userId: s.userId, organizationId: s.organizationId }, select: { id: true } });
  return m.id;
}

export async function enableFeedAction(_prev: FeedState, fd: FormData): Promise<FeedState> {
  const origin = str(fd, "origin");
  const raw = await issueFeedToken(prisma, await membershipId());
  revalidatePath("/profile");
  return { url: `${origin}/api/calendar/${raw}.ics` };
}

export async function revokeFeedAction(): Promise<void> {
  await revokeFeedToken(prisma, await membershipId());
  revalidatePath("/profile");
}

const ZONES = new Set(Intl.supportedValuesOf("timeZone"));

export async function updateOrganizationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change these" };
  const name = str(fd, "name");
  if (!name) return { error: "Name is required" };
  const timezone = str(fd, "timezone");
  if (!ZONES.has(timezone)) return { error: "Pick a valid timezone" };
  const replyTo = str(fd, "replyToEmail");
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return { error: "Reply-to must be an email address" };
  await prisma.organization.update({
    where: { id: s.organizationId },
    data: { name, timezone, legalName: str(fd, "legalName") || null, address: str(fd, "address") || null, phone: str(fd, "phone") || null, replyToEmail: replyTo || null, venmoHandle: str(fd, "venmoHandle") || null, zelleHandle: str(fd, "zelleHandle") || null },
  });
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function saveTutorAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can manage tutors" };
  const id = str(fd, "tutorId");
  const name = str(fd, "name");
  if (!name) return { error: "Name is required" };
  const money = (k: string, label: string) => {
    const v = str(fd, k);
    if (v && !/^\d+(\.\d{1,2})?$/.test(v)) throw new Error(`${label} must be a number like 45 or 45.50`);
    return v ? Math.round(Number(v) * 100) : null;
  };
  const pct = (k: string, label: string) => {
    const v = str(fd, k);
    if (v && !/^\d{1,3}$/.test(v)) throw new Error(`${label} must be a whole number from 0 to 100`);
    const n = v ? Number(v) : null;
    if (n !== null && n > 100) throw new Error(`${label} must be 0 to 100`);
    return n;
  };
  let data;
  let rates: { subject: string; hourlyPayRateCents: number | null; payPercent: number | null }[];
  try {
    const color = str(fd, "color");
    const timezone = str(fd, "timezone");
    if (timezone && !ZONES.has(timezone)) return { error: "Pick a valid timezone" };
    try { parseAvailability(str(fd, "availability")); } catch (e) { if (e instanceof AvailabilityError) return { error: `Availability: ${e.message}` }; throw e; }
    data = {
      name, email: str(fd, "email") || null, phone: str(fd, "phone") || null, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
      subjects: str(fd, "subjects").split(",").map((x) => x.trim()).filter(Boolean),
      hourlyClientRateCents: money("hourlyClientRate", "Client rate"), hourlyPayRateCents: money("hourlyPayRate", "Pay per hour"), payPercent: pct("payPercent", "Pay percent"),
      availability: str(fd, "availability") || null, timezone: timezone || null, notes: str(fd, "notes") || null,
    };
    const subjects = fd.getAll("rateSubject").map((v) => String(v).trim());
    const hourly = fd.getAll("rateHourly").map((v) => String(v).trim());
    const percent = fd.getAll("ratePercent").map((v) => String(v).trim());
    rates = [];
    subjects.forEach((subject, i) => {
      if (!subject) return;
      if (rates.some((r) => r.subject.toLowerCase() === subject.toLowerCase())) throw new Error(`${subject} is listed twice`);
      const h = hourly[i] ? money(`__h${i}`, `Pay per hour for ${subject}`) : null;
      const pc = percent[i] ? pct(`__p${i}`, `Percent for ${subject}`) : null;
      // money()/pct() read the form by key; the rows are parallel lists, so parse them here instead.
      const hv = hourly[i]; const pv = percent[i];
      if (hv && !/^\d+(\.\d{1,2})?$/.test(hv)) throw new Error(`Pay per hour for ${subject} must be a number like 45 or 45.50`);
      if (pv && (!/^\d{1,3}$/.test(pv) || Number(pv) > 100)) throw new Error(`Percent for ${subject} must be 0 to 100`);
      void h; void pc;
      rates.push({ subject, hourlyPayRateCents: hv ? Math.round(Number(hv) * 100) : null, payPercent: pv ? Number(pv) : null });
    });
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }
  if (id) {
    const t = await prisma.tutor.findFirst({ where: { id, organizationId: s.organizationId } });
    if (!t) return { error: "Tutor not found" };
    await prisma.$transaction([
      prisma.tutor.update({ where: { id }, data }),
      prisma.tutorPayRate.deleteMany({ where: { tutorId: id } }),
      ...(rates.length ? [prisma.tutorPayRate.createMany({ data: rates.map((r) => ({ ...r, tutorId: id })) })] : []),
    ]);
    await auditAs(prisma, s, { action: "tutor.update", subjectType: "tutor", subjectId: id, summary: `${name}: pay ${data.payPercent != null ? `${data.payPercent}%` : data.hourlyPayRateCents != null ? `${(data.hourlyPayRateCents / 100).toFixed(2)}/h` : "not set"}${rates.length ? `, ${rates.length} subject rule${rates.length === 1 ? "" : "s"}` : ""}` });
  } else {
    const t = await prisma.tutor.create({ data: { ...data, organizationId: s.organizationId, payRates: { create: rates } } });
    await auditAs(prisma, s, { action: "tutor.create", subjectType: "tutor", subjectId: t.id, summary: name });
  }
  revalidatePath("/settings/tutors");
  return { ok: "Saved" };
}

export async function savePolicyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change the policy" };
  const int = (k: string, max: number) => { const v = str(fd, k); return /^\d{1,3}$/.test(v) && Number(v) <= max ? Number(v) : NaN; };
  const lateCancelHours = int("lateCancelHours", 168);
  const lateCancelChargePercent = int("lateCancelChargePercent", 100);
  const noShowChargePercent = int("noShowChargePercent", 100);
  if (Number.isNaN(lateCancelHours)) return { error: "Hours must be 0 to 168" };
  if (Number.isNaN(lateCancelChargePercent) || Number.isNaN(noShowChargePercent)) return { error: "Percentages must be 0 to 100" };
  const data = { lateCancelHours, lateCancelChargePercent, noShowChargePercent, makeupOnLateCancel: fd.get("makeupOnLateCancel") === "on" };
  await prisma.organization.update({ where: { id: s.organizationId }, data });
  await auditAs(prisma, s, { action: "settings.policy", subjectType: "settings", subjectId: s.organizationId, summary: `Late under ${lateCancelHours} h charged ${lateCancelChargePercent}%, no-show ${noShowChargePercent}%${data.makeupOnLateCancel ? ", make-up credit on late" : ""}` });
  revalidatePath("/settings");
  return { ok: "Policy saved" };
}

export async function saveAlertsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change these" };
  const v = str(fd, "lowBalanceAlert");
  if (v && !/^\d+(\.\d{1,2})?$/.test(v)) return { error: "The threshold must be a number like 300 or 300.00" };
  await prisma.organization.update({ where: { id: s.organizationId }, data: { lowBalanceAlertCents: v ? Math.round(Number(v) * 100) : null, sessionNotesAuto: fd.get("sessionNotesAuto") === "on" } });
  revalidatePath("/settings");
  return { ok: "Saved" };
}

export async function addHolidayAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change holidays" };
  try { await addHoliday(prisma, s.organizationId, { name: str(fd, "name"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") || str(fd, "startsOn") }); }
  catch (e) { if (e instanceof HolidayError) return { error: e.message }; throw e; }
  revalidatePath("/settings");
  return { ok: "Added. Series marked term-time only skip it from now on; lessons already made stay." };
}

export async function removeHolidayAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return;
  await removeHoliday(prisma, s.organizationId, str(fd, "holidayId")).catch((e) => { if (!(e instanceof HolidayError)) throw e; });
  revalidatePath("/settings");
}

export async function archiveTutorAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  const id = str(fd, "tutorId");
  const t = await prisma.tutor.findFirst({ where: { id, organizationId: s.organizationId } });
  if (t) await prisma.tutor.update({ where: { id }, data: { archivedAt: t.archivedAt ? null : new Date() } });
  revalidatePath("/settings/tutors");
}

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession();
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two new passwords do not match" };
  try { await changePassword(prisma, s.userId, String(fd.get("current") ?? ""), next); }
  catch (e) { if (e instanceof AccountError) return { error: e.message }; throw e; }
  return { ok: "Password changed" };
}

export async function uploadLogoAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change the logo" };
  const f = fd.get("logo");
  if (!(f instanceof File) || f.size === 0) return { error: "Pick an image" };
  try {
    await setLogo(prisma, s.organizationId, { name: f.name, mimeType: f.type, data: new Uint8Array(await f.arrayBuffer()) }, s.userId);
  } catch (e) {
    if (e instanceof FileError) return { error: e.message };
    throw e;
  }
  revalidatePath("/settings");
  return { ok: "Logo saved. It now appears on statements, invoices, and pay slips." };
}

export async function removeLogoAction(): Promise<void> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return;
  await removeLogo(prisma, s.organizationId);
  revalidatePath("/settings");
}

export async function intakeAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return;
  const what = str(fd, "what");
  if (what === "off") await disableIntake(prisma, s.organizationId);
  else await enableIntake(prisma, s.organizationId, what === "regenerate");
  revalidatePath("/settings");
}

export async function saveAgreementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change the agreement" };
  const text = String(fd.get("template") ?? "");
  if (text.length > 20000) return { error: "The agreement is too long; keep it under 20,000 characters" };
  await prisma.organization.update({ where: { id: s.organizationId }, data: { agreementTemplate: text.trim() || null } });
  revalidatePath("/settings/agreement");
  return { ok: text.trim() ? "Saved" : "Back to the standard wording" };
}

export async function saveCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change categories" };
  const id = str(fd, "categoryId");
  try {
    if (id) await renameLessonCategory(prisma, s.organizationId, id, str(fd, "name"));
    else await addLessonCategory(prisma, s.organizationId, str(fd, "name"));
  } catch (e) { if (e instanceof CategoryError) return { error: e.message }; throw e; }
  revalidatePath("/settings");
  return { ok: id ? "Renamed" : "Added" };
}

export async function categoryArchiveAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return;
  await setLessonCategoryArchived(prisma, s.organizationId, str(fd, "categoryId"), str(fd, "archived") === "1").catch((e) => { if (!(e instanceof CategoryError)) throw e; });
  revalidatePath("/settings");
}

export async function categoryDeleteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireWriter();
  if (s.role !== "OWNER") return { error: "Only the owner can change categories" };
  try { await deleteLessonCategory(prisma, s.organizationId, str(fd, "categoryId")); }
  catch (e) { if (e instanceof CategoryError) return { error: e.message }; throw e; }
  revalidatePath("/settings");
  return { ok: "Deleted" };
}
