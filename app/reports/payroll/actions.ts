"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { ExpenseError } from "@/src/services/expenses";
import { PayrollError, recordTutorPay } from "@/src/services/payroll";

export interface ActionState { error?: string; ok?: string }

export async function recordTutorPayAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requireWriter();
    const e = await recordTutorPay(prisma, s.organizationId, String(fd.get("tutorId")), String(fd.get("month")), s.userId);
    revalidatePath("/reports/payroll");
    revalidatePath("/expenses");
    return { ok: `Recorded ${(e.amountCents / 100).toFixed(2)}` };
  } catch (e) {
    if (e instanceof PayrollError || e instanceof ExpenseError || e instanceof RoleError) return { error: e.message };
    throw e;
  }
}
