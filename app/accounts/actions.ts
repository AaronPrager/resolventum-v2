"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { PeopleError, addGuardian, removeGuardian, updateAccount, updateGuardian } from "@/src/services/people";

export interface ActionState { error?: string; ok?: string }

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function known(e: unknown) {
  return e instanceof PeopleError || e instanceof RoleError ? e.message : null;
}

export async function updateAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = str(fd, "accountId");
  try {
    const s = await requireWriter();
    await updateAccount(prisma, s.organizationId, accountId, { name: str(fd, "name"), notes: str(fd, "notes"), emailReminders: fd.get("emailReminders") === "on", emailNotes: fd.get("emailNotes") === "on" });
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/accounts");
  return { ok: "Saved" };
}

export async function saveGuardianAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = str(fd, "accountId");
  const guardianId = str(fd, "guardianId");
  const input = {
    name: str(fd, "name"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    relationship: str(fd, "relationship"),
    address: str(fd, "address"),
    isPrimary: fd.get("isPrimary") === "on",
    isBilling: fd.get("isBilling") === "on",
    isEmergency: fd.get("isEmergency") === "on",
  };
  try {
    const s = await requireWriter();
    if (guardianId) await updateGuardian(prisma, s.organizationId, guardianId, input);
    else await addGuardian(prisma, s.organizationId, accountId, input);
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath(`/accounts/${accountId}`);
  return { ok: guardianId ? "Saved" : "Contact added" };
}

export async function removeGuardianAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  await removeGuardian(prisma, s.organizationId, str(fd, "guardianId"));
  revalidatePath(`/accounts/${str(fd, "accountId")}`);
}

/** Archive an account or bring it back. Archived ones leave the default list; the money records stay. */
export async function setAccountArchivedAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  const id = str(fd, "accountId");
  const archived = str(fd, "archived") === "1";
  await prisma.account.updateMany({ where: { id, organizationId: s.organizationId }, data: { archivedAt: archived ? new Date() : null } });
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  const returnTo = str(fd, "returnTo");
  redirect(returnTo.startsWith("/") ? returnTo : "/accounts");
}
