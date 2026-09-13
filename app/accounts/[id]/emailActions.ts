"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/db";
import { RoleError, requireWriter } from "@/src/auth/current";
import { EmailError, sendEmail } from "@/src/email/send";
import { statementEmail } from "@/src/email/templates";
import { accountStatement } from "@/src/services/statement";

export interface EmailState { error?: string; ok?: string }
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
const parseDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

export async function emailStatementAction(_p: EmailState, fd: FormData): Promise<EmailState> {
  const s = await requireWriter();
  const accountId = str(fd, "accountId");
  const to = str(fd, "to");
  const account = await prisma.account.findFirst({ where: { id: accountId, organizationId: s.organizationId }, include: { organization: true } });
  if (!account) return { error: "Account not found" };
  const st = await accountStatement(prisma, accountId, { from: parseDate(str(fd, "from")), to: parseDate(str(fd, "to")) });
  if (!st) return { error: "Account not found" };
  const mail = statementEmail({ orgName: account.organization.name, accountName: account.name, st, venmo: account.organization.venmoHandle, zelle: account.organization.zelleHandle });
  try {
    await sendEmail(prisma, s.organizationId, "STATEMENT", { to, subject: mail.subject, text: mail.text, replyTo: account.organization.replyToEmail }, { type: "account", id: accountId });
  } catch (e) { if (e instanceof EmailError || e instanceof RoleError) return { error: e.message }; throw e; }
  revalidatePath(`/accounts/${accountId}`);
  return { ok: `Statement sent to ${to}` };
}
