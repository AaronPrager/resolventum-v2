"use server";

import { headers } from "next/headers";
import { prisma } from "@/src/db";
import { IntakeError, submitIntake } from "@/src/services/intake";
import { rateLimit } from "@/src/lib/ratelimit";

export interface JoinState { error?: string; done?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };

export async function joinAction(_p: JoinState, fd: FormData): Promise<JoinState> {
  // Bots fill every field; people never see this one.
  if (str(fd, "website")) return { done: "Thank you." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!process.env.DISABLE_RATE_LIMIT && !rateLimit(`join:${ip}`, 5, 60 * 60_000).ok) return { error: "Too many sign-ups from here in the last hour. Try again later." };
  try {
    const st = await submitIntake(prisma, str(fd, "code"), {
      studentFirstName: str(fd, "studentFirstName"), studentLastName: str(fd, "studentLastName"), grade: str(fd, "grade"), school: str(fd, "school"),
      studentEmail: str(fd, "studentEmail"), studentPhone: str(fd, "studentPhone"), subjects: str(fd, "subjects"), goals: str(fd, "goals"),
      parentName: str(fd, "parentName"), parentEmail: str(fd, "parentEmail"), parentPhone: str(fd, "parentPhone"), consent: fd.get("consent") === "on",
    });
    return { done: `Thank you. ${st.firstName} is signed up, and the school will be in touch soon.` };
  } catch (e) {
    if (e instanceof IntakeError) return { error: e.message };
    throw e;
  }
}
