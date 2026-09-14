"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { requireSession, requireWriter } from "@/src/auth/current";
import { AccountError, changePassword } from "@/src/auth/account";
import { issueFeedToken, revokeFeedToken } from "@/src/services/calendarFeed";
import { removeLogo, setLogo } from "@/src/services/branding";
import { FileError } from "@/src/services/files";
import { disableIntake, enableIntake } from "@/src/services/intake";

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
  revalidatePath("/settings");
  return { url: `${origin}/api/calendar/${raw}.ics` };
}

export async function revokeFeedAction(): Promise<void> {
  await revokeFeedToken(prisma, await membershipId());
  revalidatePath("/settings");
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
  const rate = str(fd, "hourlyPayRate");
  if (rate && !/^\d+(\.\d{1,2})?$/.test(rate)) return { error: "Hourly rate must be a number like 45 or 45.50" };
  const color = str(fd, "color");
  const data = { name, email: str(fd, "email") || null, phone: str(fd, "phone") || null, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null, hourlyPayRateCents: rate ? Math.round(Number(rate) * 100) : null, notes: str(fd, "notes") || null };
  if (id) {
    const t = await prisma.tutor.findFirst({ where: { id, organizationId: s.organizationId } });
    if (!t) return { error: "Tutor not found" };
    await prisma.tutor.update({ where: { id }, data });
  } else {
    await prisma.tutor.create({ data: { ...data, organizationId: s.organizationId } });
  }
  revalidatePath("/settings/tutors");
  return { ok: "Saved" };
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
