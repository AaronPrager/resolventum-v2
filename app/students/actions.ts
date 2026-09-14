"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { archiveStudent, unarchiveStudent } from "@/src/services/students";
import {
  PeopleError, type StudentInput, addProgressNote, createStudent, deleteProgressNote, moveStudent, updateProgressNote, updateStudent,
} from "@/src/services/people";

export interface ActionState { error?: string; ok?: string }

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function readStudent(fd: FormData): StudentInput {
  const price = str(fd, "defaultPrice");
  if (price && !/^\d+(\.\d{1,2})?$/.test(price)) throw new PeopleError("Usual price must be a number like 130 or 130.00");
  return {
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    grade: str(fd, "grade"),
    schoolName: str(fd, "schoolName"),
    dateOfBirth: str(fd, "dateOfBirth"),
    defaultSubject: str(fd, "defaultSubject"),
    defaultPriceCents: price ? Math.round(Number(price) * 100) : null,
    difficulties: str(fd, "difficulties"),
    notes: str(fd, "notes"),
  };
}
function known(e: unknown): string | null {
  return e instanceof PeopleError || e instanceof RoleError ? e.message : null;
}

export async function createStudentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const session = await requireWriter();
    const input = readStudent(fd);
    const family = str(fd, "family") === "existing"
      ? { accountId: str(fd, "accountId") }
      : { accountName: str(fd, "accountName"), guardian: { name: str(fd, "guardianName"), email: str(fd, "guardianEmail"), phone: str(fd, "guardianPhone") } };
    if ("accountId" in family && !family.accountId) return { error: "Pick the family account" };
    id = (await createStudent(prisma, session.organizationId, input, family)).id;
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/students");
  revalidatePath("/accounts");
  redirect(`/students/${id}`);
}

export async function updateStudentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "studentId");
  try {
    const session = await requireWriter();
    await updateStudent(prisma, session.organizationId, id, readStudent(fd));
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function moveStudentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "studentId");
  const target = str(fd, "target");
  try {
    const session = await requireWriter();
    if (!target) return { error: "Pick where the student goes" };
    const to = target === "new" ? { newAccountName: str(fd, "newAccountName") } : { accountId: target };
    await moveStudent(prisma, session.organizationId, id, to, localDateOnly(new Date(), session.timezone));
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/students");
  revalidatePath("/accounts");
  redirect(`/students/${id}`);
}

export async function saveProgressNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  const noteId = str(fd, "noteId");
  try {
    const session = await requireWriter();
    const input = { notedOn: str(fd, "notedOn"), note: str(fd, "note") };
    if (noteId) await updateProgressNote(prisma, session.organizationId, noteId, input);
    else await addProgressNote(prisma, session.organizationId, studentId, input, session.userId);
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath(`/students/${studentId}`);
  return { ok: noteId ? "Saved" : "Note added" };
}

export async function deleteProgressNoteAction(fd: FormData): Promise<void> {
  const session = await requireWriter();
  await deleteProgressNote(prisma, session.organizationId, str(fd, "noteId"));
  revalidatePath(`/students/${str(fd, "studentId")}`);
}

export async function archiveStudentAction(fd: FormData) {
  const session = await requireWriter();
  const id = String(fd.get("studentId") ?? "");
  await archiveStudent(prisma, session.organizationId, id);
  revalidatePath("/students");
  revalidatePath("/calendar");
  redirect(`/students/${id}`);
}

export async function unarchiveStudentAction(fd: FormData) {
  const session = await requireWriter();
  const id = String(fd.get("studentId") ?? "");
  await unarchiveStudent(prisma, session.organizationId, id);
  revalidatePath("/students");
  redirect(`/students/${id}`);
}
