"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { FileError } from "@/src/services/files";
import { HomeworkError, submitWork } from "@/src/services/homework";

export interface SubmitState { error?: string; ok?: string }

export async function submitAction(_p: SubmitState, fd: FormData): Promise<SubmitState> {
  const token = String(fd.get("token") ?? "");
  const note = String(fd.get("note") ?? "");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    const payload = [];
    for (const f of files) payload.push({ name: f.name, mimeType: f.type || "application/octet-stream", data: new Uint8Array(await f.arrayBuffer()) });
    const n = await submitWork(prisma, token, payload, note);
    revalidatePath(`/h/${token}`);
    return { ok: n > 0 ? `Sent ${n} file${n === 1 ? "" : "s"}. Your tutor will take a look.` : "Sent. Your tutor will take a look." };
  } catch (e) {
    if (e instanceof HomeworkError || e instanceof FileError) return { error: e.message };
    throw e;
  }
}
