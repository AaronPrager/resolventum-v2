/** Email a family its statement with the PDF attached, and log it. */
import type { PrismaClient } from "../../generated/prisma/client";
import { sendEmail } from "../email/send";
import { statementEmail } from "../email/templates";
import { accountStatement } from "../services/statement";
import { DocumentError, accountDocument } from "./accountDocs";

const parseDate = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

export async function emailAccountStatement(
  db: PrismaClient,
  organizationId: string,
  accountId: string,
  opts: { email: string; from?: string | null; to?: string | null; today: Date },
): Promise<string> {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId }, include: { organization: true } });
  if (!account) throw new DocumentError("Account not found");
  const st = await accountStatement(db, accountId, { from: parseDate(opts.from), to: parseDate(opts.to) });
  if (!st) throw new DocumentError("Account not found");
  const org = account.organization;
  const mail = statementEmail({ orgName: org.name, accountName: account.name, st, venmo: org.venmoHandle, zelle: org.zelleHandle });
  const pdf = await accountDocument(db, organizationId, accountId, { kind: "statement", from: opts.from, to: opts.to, today: opts.today });
  return sendEmail(
    db, organizationId, "STATEMENT",
    { to: opts.email, subject: mail.subject, text: mail.text, replyTo: org.replyToEmail, attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes) }] },
    { type: "account", id: accountId },
  );
}
