"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { StudentError, type StudentState, deleteStudent, setStudentState } from "@/src/services/students";
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
  return e instanceof PeopleError || e instanceof StudentError || e instanceof RoleError ? e.message : null;
}
const STATES: StudentState[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

/** Moves a student between active, paused, and archived, and writes the audit line. */
async function moveState(session: Awaited<ReturnType<typeof requireWriter>>, id: string, state: StudentState) {
  const r = await setStudentState(prisma, session.organizationId, id, state);
  if (r.changed) {
    const st = await prisma.student.findUniqueOrThrow({ where: { id }, select: { firstName: true, lastName: true } });
    await auditAs(prisma, session, { action: "student.status", subjectType: "student", subjectId: id, summary: `${st.firstName} ${st.lastName}: ${r.from.toLowerCase()} to ${state.toLowerCase()}${r.cancelledLessons ? `, ${r.cancelledLessons} lessons cancelled` : ""}${r.endedSeries ? `, ${r.endedSeries} series ended` : ""}` });
  }
  revalidatePath("/calendar");
  revalidatePath("/");
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
    const state = str(fd, "state") as StudentState;
    if (STATES.includes(state)) await moveState(session, id, state);
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



/** Archive or bring back from a list row, or any other one-click move between states. */
export async function setStudentStateAction(fd: FormData) {
  const session = await requireWriter();
  const id = str(fd, "studentId");
  const state = str(fd, "state") as StudentState;
  if (!STATES.includes(state)) throw new PeopleError("Unknown status");
  await moveState(session, id, state);
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  const returnTo = str(fd, "returnTo");
  redirect(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : `/students/${id}`);
}

/** Delete a student added by mistake. One with lessons or charges is refused; archive those. */
export async function deleteStudentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "studentId");
  try {
    const session = await requireWriter();
    const st = await prisma.student.findFirst({ where: { id, organizationId: session.organizationId }, select: { firstName: true, lastName: true } });
    await deleteStudent(prisma, session.organizationId, id);
    await auditAs(prisma, session, { action: "student.delete", subjectType: "student", subjectId: id, summary: st ? `${st.firstName} ${st.lastName} deleted` : "deleted" });
  } catch (e) {
    const m = known(e);
    if (m) return { error: m };
    throw e;
  }
  revalidatePath("/students");
  revalidatePath("/accounts");
  redirect(str(fd, "returnTo").startsWith("/students") ? str(fd, "returnTo") : "/students");
}
