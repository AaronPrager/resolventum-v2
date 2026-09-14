"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { requireWriter } from "@/src/auth/current";
import { archiveStudent, unarchiveStudent } from "@/src/services/students";

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
