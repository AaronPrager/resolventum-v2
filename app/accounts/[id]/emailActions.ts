"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { EmailError } from "@/src/email/send";
import { DocumentError } from "@/src/documents/accountDocs";
import { emailAccountStatement } from "@/src/documents/emailStatement";

export interface EmailState { error?: string; ok?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };

export async function emailStatementAction(_p: EmailState, fd: FormData): Promise<EmailState> {
  const accountId = str(fd, "accountId");
  const email = str(fd, "email");
  try {
    const s = await requireWriter();
    await emailAccountStatement(prisma, s.organizationId, accountId, { email, from: str(fd, "periodFrom"), to: str(fd, "periodTo"), today: localDateOnly(new Date(), s.timezone) });
  } catch (e) {
    if (e instanceof EmailError || e instanceof RoleError || e instanceof DocumentError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/accounts/${accountId}`);
  return { ok: `Statement sent to ${email}` };
}
