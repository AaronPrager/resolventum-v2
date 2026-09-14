/**
 * The tutoring agreement: the school's template with the student's details
 * filled in, as a PDF with signature lines.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PrismaClient } from "../../generated/prisma/client";
import { formatCents, formatDate } from "../lib/format";
import { loadLogo } from "../services/branding";
import { FAINT, INK, M, MUTED, W, Writer, drawBrand, pdfSafe } from "./accountPdf";

export const AGREEMENT_FIELDS: [string, string][] = [
  ["{{SCHOOL_NAME}}", "Your school's name"],
  ["{{STUDENT_NAME}}", "The student's full name"],
  ["{{PARENT_NAME}}", "The main parent contact"],
  ["{{LESSON_PRICE}}", "The student's usual price per lesson"],
  ["{{DATE}}", "Today's date"],
  ["{{SCHOOL_EMAIL}}", "Your reply-to email"],
  ["{{SCHOOL_PHONE}}", "Your phone"],
  ["{{SCHOOL_CONTACT}}", "Your email and phone, whichever you have"],
];

export const DEFAULT_AGREEMENT = `Tutoring agreement between {{SCHOOL_NAME}} and the family of {{STUDENT_NAME}}.

Lessons. {{SCHOOL_NAME}} will teach {{STUDENT_NAME}} at the times agreed with {{PARENT_NAME}}. Lessons are scheduled weekly unless we agree otherwise.

Fees. Each lesson costs {{LESSON_PRICE}}. You will receive a statement showing lessons and payments. Payment is due on receipt of the statement.

Cancellations. Please cancel at least 24 hours before a lesson. A lesson cancelled with less notice, or missed, may be charged in full.

Communication. We will contact you at the email and phone you gave us about scheduling, homework, progress, and billing. Questions can go to {{SCHOOL_CONTACT}}.

Ending lessons. Either side may stop lessons at any time by letting the other know. Lessons already given are still owed.`;

export class AgreementError extends Error {}

export function fillAgreement(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}

export async function agreementPdf(db: PrismaClient, organizationId: string, studentId: string, today: Date) {
  const s = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    include: { organization: true, account: { include: { guardians: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } } },
  });
  if (!s) throw new AgreementError("Student not found");
  const org = s.organization;
  const parent = s.account.guardians[0]?.name ?? "the parent or guardian";
  const values = {
    SCHOOL_NAME: org.name,
    STUDENT_NAME: `${s.firstName} ${s.lastName}`,
    PARENT_NAME: parent,
    LESSON_PRICE: s.defaultPriceCents != null ? formatCents(s.defaultPriceCents) : "the agreed price",
    DATE: formatDate(today),
    SCHOOL_EMAIL: org.replyToEmail ?? "",
    SCHOOL_PHONE: org.phone ?? "",
    SCHOOL_CONTACT: [org.replyToEmail, org.phone].filter(Boolean).join(" or ") || org.name,
  };
  const text = fillAgreement(org.agreementTemplate?.trim() || DEFAULT_AGREEMENT, values);

  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Tutoring agreement ${values.STUDENT_NAME}`));
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  w.newPage();
  let y = await drawBrand(w, org, await loadLogo(db, organizationId), w.y);
  y -= 10;
  w.text("Tutoring agreement", M, y, { size: 16, bold: true });
  w.text(values.DATE, W - M, y, { size: 9, color: MUTED, align: "right" });
  y -= 26;

  const ensure = (need: number) => {
    if (y - need < M + 30) {
      w.newPage();
      y = w.y;
    }
  };
  for (const para of text.split(/\n\s*\n/)) {
    const lines = w.wrap(para.replace(/\n/g, " "), 10.5, W - 2 * M);
    for (const line of lines) {
      ensure(15);
      w.text(line, M, y, { size: 10.5, color: INK });
      y -= 15;
    }
    y -= 8;
  }

  ensure(120);
  y -= 30;
  const col = (W - 2 * M - 40) / 2;
  for (const [i, who] of [parent, org.name].entries()) {
    const x = M + i * (col + 40);
    w.rule(y, x, x + col, INK, 0.8);
    w.text("Signature", x, y - 13, { size: 8.5, color: FAINT });
    w.text(who, x, y - 26, { size: 9.5 });
    w.rule(y - 56, x, x + col * 0.55, INK, 0.8);
    w.text("Date", x, y - 69, { size: 8.5, color: FAINT });
  }
  const bytes = await doc.save();
  return { bytes, filename: `Tutoring agreement - ${values.STUDENT_NAME.replace(/[\\/:*?"<>|]+/g, " ")}.pdf` };
}
