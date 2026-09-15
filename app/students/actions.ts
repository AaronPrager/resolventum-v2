"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { type StudentState, setStudentState } from "@/src/services/students";
import { auditAs } from "@/src/services/audit";
import { PeopleError, type StudentInput, createStudent, moveStudent, updateStudent } from "@/src/services/people";

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



const STATES: StudentState[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

/** The one action that moves a student between active, paused, and archived. */
export async function setStudentStateAction(fd: FormData) {
  const session = await requireWriter();
  const id = str(fd, "studentId");
  const state = str(fd, "state") as StudentState;
  if (!STATES.includes(state)) throw new PeopleError("Unknown status");
  const r = await setStudentState(prisma, session.organizationId, id, state);
  if (r.changed) {
    const st = await prisma.student.findUniqueOrThrow({ where: { id }, select: { firstName: true, lastName: true } });
    await auditAs(prisma, session, { action: "student.status", subjectType: "student", subjectId: id, summary: `${st.firstName} ${st.lastName}: ${r.from.toLowerCase()} to ${state.toLowerCase()}${r.cancelledLessons ? `, ${r.cancelledLessons} lessons cancelled` : ""}${r.endedSeries ? `, ${r.endedSeries} series ended` : ""}` });
  }
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  const returnTo = str(fd, "returnTo");
  // From the list, land on the tab the student is now under, still selected.
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.startsWith("/students?")) redirect(`/students?${state === "ARCHIVED" ? "status=ARCHIVED&" : ""}s=${id}`);
  redirect(returnTo);
}
