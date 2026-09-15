/**
 * Outgoing email. One function, two ways out, every send logged as a
 * Message row so the app can show what went to whom and when.
 *
 * Resend: RESEND_API_KEY and EMAIL_FROM ("Resolventum <mail@yourdomain>").
 * Your own mailbox over SMTP: SMTP_HOST, SMTP_USER, SMTP_PASS (an app-specific
 * password for iCloud or Gmail), SMTP_PORT (587), SMTP_SECURE ("true" for 465),
 * and EMAIL_FROM, which for iCloud must be that mailbox or one of its aliases.
 * SMTP wins when both are set. Without either, sends fail with a clear message
 * and the Message row says so.
 * EMAIL_REDIRECT_TO sends every email to that one address instead of the
 * real recipient, for a developer machine with real family data. Tests
 * replace the transport with setTransport().
 */
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import type { PrismaClient } from "../../generated/prisma/client";

export class EmailError extends Error {}
export class EmailNotConfiguredError extends EmailError {
  constructor() {
    super("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM, or the SMTP_* settings, on the server to turn it on.");
  }
}

export type MessageKind = "EMAIL_VERIFY" | "PASSWORD_RESET" | "INVITE" | "HOMEWORK_INVITE" | "HOMEWORK_SUBMITTED" | "LESSON_REMINDER" | "DAILY_SCHEDULE" | "BALANCE_REMINDER" | "STATEMENT" | "INTAKE_CONFIRMATION" | "SESSION_NOTE" | "LOW_BALANCE_ALERT" | "OTHER";

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
let smtp: Transporter | null = null;

export function setTransport(t: Transport | null) {
  override = t;
}
/** Which way mail goes out: your own mailbox over SMTP, Resend, or nothing yet. */
export function emailProvider(): "smtp" | "resend" | null {
  const e = process.env;
  if (e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS && e.EMAIL_FROM) return "smtp";
  if (e.RESEND_API_KEY && e.EMAIL_FROM) return "resend";
  return null;
}
export function emailConfigured(): boolean {
  return emailProvider() !== null;
}

async function smtpTransport(mail: OutgoingEmail) {
  const e = process.env;
  const host = e.SMTP_HOST!;
  const secure = e.SMTP_SECURE === "true";
  smtp ??= nodemailer.createTransport({
    host,
    port: Number(e.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    // iCloud and most others want STARTTLS on 587; never fall back to plain text.
    requireTLS: !secure,
    auth: { user: e.SMTP_USER!, pass: e.SMTP_PASS! },
  });
  const info = await smtp.sendMail({
    from: e.EMAIL_FROM!,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html ?? textToHtml(mail.text),
    replyTo: mail.replyTo ?? undefined,
    attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  return { providerMessageId: info.messageId ?? null };
}
/** Where every email goes instead of its recipient, when set. Null in normal use. */
export function emailRedirect(): string | null {
  const to = process.env.EMAIL_REDIRECT_TO?.trim();
  return to ? to : null;
}

async function resendTransport(mail: OutgoingEmail) {
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
    // On a developer machine everything can go to one inbox; the subject says who it was for.
    const redirect = emailRedirect();
    const outgoing = redirect ? { ...mail, to: redirect, subject: `[for ${to}] ${mail.subject}` } : { ...mail, to };
    const provider = emailProvider();
    const send = override ?? (provider === "smtp" ? smtpTransport : provider === "resend" ? resendTransport : null);
    if (!send) throw new EmailNotConfiguredError();
    const r = await send(outgoing);
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
