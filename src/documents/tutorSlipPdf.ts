/** A tutor's pay slip for one month: every lesson, total hours, rate, and pay. */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PrismaClient } from "../../generated/prisma/client";
import { formatCents, formatDate } from "../lib/format";
import { tutorMonth } from "../services/payroll";
import { BRAND, FAINT, FILL, INK, M, MUTED, W, Writer, drawBrand, pdfSafe } from "./accountPdf";
import { loadLogo } from "../services/branding";

export async function tutorSlip(db: PrismaClient, organizationId: string, tutorId: string, month: string, today: Date) {
  const m = await tutorMonth(db, organizationId, tutorId, month);
  const org = m.tutor.organization;
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Pay slip ${m.tutor.name} ${m.label}`));
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  w.newPage();
  let y = w.y;
  const brandBottom = await drawBrand(w, org, await loadLogo(db, organizationId), y);
  w.text("PAY SLIP", W - M, y - 16, { size: 17, bold: true, align: "right", color: BRAND });
  w.text(`Date ${formatDate(today)}`, W - M, y - 34, { size: 8.5, align: "right", color: MUTED });
  w.text(`Period ${m.label}`, W - M, y - 47, { size: 8.5, align: "right", color: MUTED });
  y = Math.min(brandBottom, y - 56) - 14;
  w.rule(y);
  y -= 24;
  w.text("TUTOR", M, y, { size: 7.5, bold: true, color: FAINT });
  y -= 15;
  w.text(m.tutor.name, M, y, { size: 11, bold: true });
  y -= 13;
  for (const line of [m.tutor.email, m.tutor.phone].filter(Boolean) as string[]) {
    w.text(line, M, y, { size: 9, color: MUTED });
    y -= 12;
  }
  y -= 16;

  const cols = { date: M, time: M + 78, who: M + 140, subject: M + 330, min: W - M };
  const header = () => {
    w.box(M - 6, y - 6, W - 2 * M + 12, 20, FILL);
    w.text("Date", cols.date, y, { size: 8, bold: true, color: MUTED });
    w.text("Time", cols.time, y, { size: 8, bold: true, color: MUTED });
    w.text("Students", cols.who, y, { size: 8, bold: true, color: MUTED });
    w.text("Subject", cols.subject, y, { size: 8, bold: true, color: MUTED });
    w.text("Minutes", cols.min, y, { size: 8, bold: true, color: MUTED, align: "right" });
    y -= 22;
  };
  header();
  if (m.lessons.length === 0) {
    w.text("No lessons with this tutor in the month.", cols.who, y, { size: 9.5, color: MUTED });
    y -= 20;
  }
  for (const l of m.lessons) {
    if (y < M + 120) {
      w.newPage();
      y = w.y - 6;
      header();
    }
    w.text(formatDate(new Date(`${l.date}T00:00:00Z`)), cols.date, y, { size: 9.5 });
    w.text(l.time, cols.time, y, { size: 9.5, color: MUTED });
    w.text(l.students, cols.who, y, { size: 9.5, maxWidth: 180 });
    w.text(l.subject, cols.subject, y, { size: 9, color: MUTED, maxWidth: 150 });
    w.text(String(l.minutes), cols.min, y, { size: 9.5, align: "right" });
    y -= 17;
    w.rule(y + 5);
    y -= 4;
  }
  y -= 12;
  const tx = W - M - 220;
  const hours = m.minutes / 60;
  const lines: [string, string][] = [
    ["Lessons", String(m.lessons.length)],
    ["Hours", hours.toFixed(2)],
    ["Pay rate", m.rateLabel],
  ];
  for (const [k, v] of lines) {
    w.text(k, tx, y, { size: 9.5, color: MUTED });
    w.text(v, W - M, y, { size: 9.5, align: "right" });
    y -= 15;
  }
  w.rule(y + 7, tx, W - M, INK, 0.9);
  y -= 10;
  w.text("Pay", tx, y, { size: 11, bold: true });
  w.text(m.payCents == null ? "set a rate" : formatCents(m.payCents), W - M, y, { size: 12.5, bold: true, align: "right" });
  if (m.recorded) {
    y -= 18;
    w.text(`Recorded as an expense on ${formatDate(m.recorded.spentOn)}`, W - M, y, { size: 8.5, color: MUTED, align: "right" });
  }
  const bytes = await doc.save();
  return { bytes, filename: `Pay slip - ${m.tutor.name.replace(/[\\/:*?"<>|]+/g, " ")} - ${month}.pdf` };
}
