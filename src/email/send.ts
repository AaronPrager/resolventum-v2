/**
 * Outgoing email. One function, one provider (Resend), every send logged as
 * a Message row so the app can show what went to whom and when.
 *
 * Configure with RESEND_API_KEY and EMAIL_FROM ("Resolventum <mail@yourdomain>").
 * Without them sends fail with a clear message and the Message row says so.
 * Tests replace the transport with setTransport().
 */
import { Resend } from "resend";
import type { PrismaClient } from "../../generated/prisma/client";

export class EmailError extends Error {}
export class EmailNotConfiguredError extends EmailError {
  constructor() {
    super("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server to turn it on.");
  }
}

export type MessageKind = "EMAIL_VERIFY" | "PASSWORD_RESET" | "INVITE" | "HOMEWORK_INVITE" | "HOMEWORK_SUBMITTED" | "LESSON_REMINDER" | "DAILY_SCHEDULE" | "BALANCE_REMINDER" | "STATEMENT" | "INTAKE_CONFIRMATION" | "OTHER";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
  attachments?: { filename: string; content: Buffer }[];
}

export type Transport = (mail: OutgoingEmail) => Promise<{ providerMessageId: string | null }>;

let override: Transport | null = null;
let client: Resend | null = null;

export function setTransport(t: Transport | null) {
  override = t;
}
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function resendTransport(mail: OutgoingEmail) {
  if (!emailConfigured()) throw new EmailNotConfiguredError();
  client ??= new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await client.emails.send({
    from: process.env.EMAIL_FROM!,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html ?? textToHtml(mail.text),
    replyTo: mail.replyTo ?? undefined,
    attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  if (error) throw new EmailError(`Email failed: ${error.message}`);
  return { providerMessageId: data?.id ?? null };
}

/** Send and log. Throws EmailError on failure after logging the failure. */
export async function sendEmail(db: PrismaClient, organizationId: string, kind: MessageKind, mail: OutgoingEmail, related?: { type: string; id: string }) {
  const to = mail.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new EmailError(`"${to}" is not an email address`);
  const row = await db.message.create({
    data: { organizationId, kind, toEmail: to, subject: mail.subject, bodyText: mail.text, relatedType: related?.type ?? null, relatedId: related?.id ?? null, status: "QUEUED" },
  });
  try {
    const r = await (override ?? resendTransport)({ ...mail, to });
    await db.message.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: r.providerMessageId } });
    return row.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.message.update({ where: { id: row.id }, data: { status: "FAILED", error: msg.slice(0, 500) } });
    if (e instanceof EmailError) throw e;
    throw new EmailError(`Email failed: ${msg}`);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text to simple HTML: paragraphs on blank lines, links clickable. */
export function textToHtml(text: string): string {
  const paras = escapeHtml(text).split(/\n\s*\n/).map((p) => p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>'));
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#16181d;max-width:640px">${paras.map((p) => `<p style="margin:0 0 1em">${p}</p>`).join("")}</div>`;
}
