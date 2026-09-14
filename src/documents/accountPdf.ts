/**
 * Statement and invoice PDFs for a family account, drawn with pdf-lib so they
 * work anywhere Node runs (no browser, no fonts on disk). US Letter.
 *
 * Statement: every charge and payment in the period with a running balance.
 * Invoice: the charges for one month, then previous balance, payments received,
 * and the amount due. Invoice numbers are derived (month + account), not stored.
 */
import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Statement } from "../services/statement";
import { formatCents, formatDate } from "../lib/format";

export interface DocOrg {
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  replyToEmail?: string | null;
  venmoHandle?: string | null;
  zelleHandle?: string | null;
}
export interface DocBillTo {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}
export interface AccountDocInput {
  kind: "statement" | "invoice";
  org: DocOrg;
  accountName: string;
  billTo: DocBillTo | null;
  st: Statement;
  issuedOn: Date;
  /** Invoice only. */
  number?: string;
  logo?: { bytes: Uint8Array; mime: string } | null;
}

/**
 * Draw the school's logo (if any) and name at the top left. Returns the y just
 * under the block, so the address lines can follow.
 */
export async function drawBrand(w: Writer, org: { name: string }, logo: { bytes: Uint8Array; mime: string } | null | undefined, top: number): Promise<number> {
  let y = top;
  if (logo) {
    try {
      const img = logo.mime === "image/png" ? await w.doc.embedPng(logo.bytes) : await w.doc.embedJpg(logo.bytes);
      const scale = Math.min(150 / img.width, 42 / img.height, 1);
      const h = img.height * scale;
      w.page.drawImage(img, { x: M, y: y - h, width: img.width * scale, height: h });
      y -= h + 12;
    } catch {
      // A broken image never stops the document.
    }
  }
  w.text(org.name, M, y - 14, { size: logo ? 13 : 17, bold: true, maxWidth: 300 });
  return y - (logo ? 28 : 32);
}

export const W = 612;
export const H = 792;
export const M = 48;
export const INK = rgb(0.106, 0.106, 0.094);
export const MUTED = rgb(0.424, 0.42, 0.4);
export const FAINT = rgb(0.6, 0.6, 0.576);
export const LINE = rgb(0.906, 0.902, 0.886);
export const FILL = rgb(0.961, 0.961, 0.953);
export const BRAND = rgb(0.31, 0.275, 0.898);
export const OWED = rgb(0.753, 0.212, 0.173);
export const CREDIT = rgb(0.082, 0.502, 0.239);

/** Standard PDF fonts only speak Windows-1252. Swap what they cannot draw. */
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfSafe(s: string): string {
  return Array.from(s.normalize("NFC"))
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (ch === "\n" || ch === "\t") return " ";
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch)) return ch;
      if (c === 0x2011 || c === 0x2012) return "-";
      if (c === 0x2032) return "'";
      return "?";
    })
    .join("");
}

export function invoiceNumber(accountId: string, month: string): string {
  return `${month.replace("-", "")}-${accountId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

export class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(public doc: PDFDocument, public regular: PDFFont, public bold: PDFFont) {}

  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.pages.push(this.page);
    this.y = H - M;
  }
  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right"; maxWidth?: number } = {}) {
    const size = o.size ?? 9.5;
    const font = o.bold ? this.bold : this.regular;
    let t = pdfSafe(s);
    if (o.maxWidth) t = this.fit(t, font, size, o.maxWidth);
    const w = font.widthOfTextAtSize(t, size);
    this.page.drawText(t, { x: o.align === "right" ? x - w : x, y, size, font, color: o.color ?? INK });
    return w;
  }
  fit(t: string, font: PDFFont, size: number, max: number) {
    if (font.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }
  /** Wrap into lines no wider than max. */
  wrap(s: string, size: number, max: number, bold = false): string[] {
    const font = bold ? this.bold : this.regular;
    const words = pdfSafe(s).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= max) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = font.widthOfTextAtSize(w, size) <= max ? w : this.fit(w, font, size, max);
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  rule(y: number, x1 = M, x2 = W - M, color = LINE, thickness = 0.75) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }
  box(x: number, y: number, w: number, h: number, fill = FILL) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: fill });
  }
}

function balanceLabel(cents: number) {
  if (cents > 0) return { label: "Balance due", value: formatCents(cents), color: OWED };
  if (cents < 0) return { label: "Credit on account", value: formatCents(-cents), color: CREDIT };
  return { label: "Balance", value: formatCents(0), color: INK };
}

export async function renderAccountPdf(input: AccountDocInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = input.kind === "invoice" ? "Invoice" : "Statement";
  doc.setTitle(pdfSafe(`${title} ${input.accountName}`));
  doc.setAuthor(pdfSafe(input.org.name));
  doc.setCreator("Resolventum");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const { st, org } = input;
  const period = st.from && st.to ? `${formatDate(st.from)} to ${formatDate(st.to)}` : st.to ? `Through ${formatDate(st.to)}` : st.from ? `From ${formatDate(st.from)}` : "All activity";

  w.newPage();

  // ---- header: school on the left, document title and facts on the right
  let y = w.y;
  let ly = await drawBrand(w, org, input.logo, y);
  for (const line of [org.legalName && org.legalName !== org.name ? org.legalName : null, ...(org.address ?? "").split(/\n|,\s*(?=\S)/).map((s) => s.trim()).filter(Boolean).slice(0, 3), [org.phone, org.replyToEmail].filter(Boolean).join("  ·  ") || null].filter(Boolean) as string[]) {
    w.text(line, M, ly, { size: 8.5, color: MUTED, maxWidth: 300 });
    ly -= 11.5;
  }
  w.text(title.toUpperCase(), W - M, y - 16, { size: 17, bold: true, align: "right", color: BRAND });
  const facts: [string, string][] = [
    ...(input.number ? [["Invoice no.", input.number] as [string, string]] : []),
    ["Date", formatDate(input.issuedOn)],
    ["Period", period],
    ...(input.kind === "invoice" ? [["Due", "On receipt"] as [string, string]] : []),
  ];
  let fy = y - 34;
  for (const [k, v] of facts) {
    w.text(k, W - M - 150, fy, { size: 8.5, color: MUTED });
    w.text(v, W - M, fy, { size: 8.5, align: "right", maxWidth: 140 });
    fy -= 12.5;
  }
  y = Math.min(ly, fy) - 14;
  w.rule(y);
  y -= 24;

  // ---- bill to (left) and summary (right)
  const topOfBlocks = y;
  w.text("BILL TO", M, y, { size: 7.5, bold: true, color: FAINT });
  y -= 15;
  w.text(input.billTo?.name ?? input.accountName, M, y, { size: 11, bold: true, maxWidth: 260 });
  y -= 13;
  const billLines = [
    input.billTo && input.billTo.name !== input.accountName ? input.accountName : null,
    input.billTo?.email ?? null,
    input.billTo?.phone ?? null,
    input.billTo?.address ?? null,
    st.studentNames.length ? `Students: ${st.studentNames.join(", ")}` : null,
  ].filter(Boolean) as string[];
  for (const line of billLines) {
    for (const l of w.wrap(line, 9, 260).slice(0, 2)) {
      w.text(l, M, y, { size: 9, color: MUTED });
      y -= 12;
    }
  }
  const leftBottom = y;

  const bx = W - M - 220;
  const bal = balanceLabel(st.closingBalanceCents);
  const rows: [string, string][] =
    input.kind === "invoice"
      ? [["Previous balance", balanceText(st.openingBalanceCents)], ["Charges this month", formatCents(st.chargedCents)], ["Payments received", minus(st.paidCents)]]
      : [["Opening balance", balanceText(st.openingBalanceCents)], ["Charges", formatCents(st.chargedCents)], ["Payments", minus(st.paidCents)]];
  const boxH = 18 + rows.length * 16 + 34;
  const by = topOfBlocks + 10 - boxH;
  w.box(bx, by, 220, boxH);
  let sy = topOfBlocks - 8;
  for (const [k, v] of rows) {
    w.text(k, bx + 14, sy, { size: 9, color: MUTED });
    w.text(v, bx + 206, sy, { size: 9, align: "right" });
    sy -= 16;
  }
  w.rule(sy + 6, bx + 14, bx + 206, LINE);
  sy -= 14;
  w.text(input.kind === "invoice" && st.closingBalanceCents > 0 ? "Amount due" : bal.label, bx + 14, sy, { size: 10.5, bold: true });
  w.text(bal.value, bx + 206, sy, { size: 12.5, bold: true, align: "right", color: bal.color });

  y = Math.min(leftBottom, by) - 26;

  // ---- table
  const statement = input.kind === "statement";
  const cols = statement
    ? [{ key: "date", label: "Date", x: M, w: 70 }, { key: "desc", label: "Description", x: M + 76, w: 250 }, { key: "charge", label: "Charges", x: W - M - 150, w: 70, right: true }, { key: "pay", label: "Payments", x: W - M - 75, w: 70, right: true }, { key: "bal", label: "Balance", x: W - M, w: 72, right: true }]
    : [{ key: "date", label: "Date", x: M, w: 70 }, { key: "desc", label: "Description", x: M + 76, w: 290 }, { key: "student", label: "Student", x: M + 372, w: 90 }, { key: "amt", label: "Amount", x: W - M, w: 70, right: true }];

  const header = () => {
    w.box(M - 6, y - 6, W - 2 * M + 12, 20);
    for (const c of cols) w.text(c.label, c.right ? c.x : c.x, y, { size: 8, bold: true, color: MUTED, align: c.right ? "right" : "left" });
    y -= 22;
  };
  const FOOTER = 70;
  const ensure = (need: number) => {
    if (y - need < M + FOOTER) {
      w.newPage();
      y = w.y - 6;
      w.text(`${title} · ${input.accountName}`, M, y, { size: 8.5, color: MUTED, maxWidth: 360 });
      w.text("continued", W - M, y, { size: 8.5, color: FAINT, align: "right" });
      y -= 24;
      header();
    }
  };

  header();
  const entries = statement ? st.entries : st.entries.filter((e) => e.kind === "charge");
  if (statement && st.from) {
    w.text("", M, y);
    w.text("Opening balance", cols[1].x, y, { size: 9.5, color: MUTED });
    w.text(balanceText(st.openingBalanceCents), W - M, y, { size: 9.5, align: "right", color: MUTED });
    y -= 8;
    w.rule(y + 2);
    y -= 12;
  }
  if (entries.length === 0) {
    w.text(statement ? "No activity in this period." : "No charges this month.", cols[1].x, y, { size: 9.5, color: MUTED });
    y -= 20;
  }
  for (const e of entries) {
    const descMax = cols[1].w;
    const main = e.kind === "payment" ? `${e.description} (${e.subkind.toLowerCase().replace("_", " ")})` : e.description;
    const lines = w.wrap(main, 9.5, descMax).slice(0, 2);
    const rowH = 5 + lines.length * 12;
    ensure(rowH + 4);
    w.text(formatDate(e.date), cols[0].x, y, { size: 9.5 });
    lines.forEach((l, i) => w.text(l, cols[1].x, y - i * 12, { size: 9.5 }));
    if (statement) {
      if (e.kind === "charge") w.text(formatCents(e.deltaCents), cols[2].x, y, { size: 9.5, align: "right" });
      else w.text(formatCents(-e.deltaCents), cols[3].x, y, { size: 9.5, align: "right", color: CREDIT });
      w.text(balanceText(e.runningBalanceCents), cols[4].x, y, { size: 9.5, align: "right", color: e.runningBalanceCents > 0 ? INK : e.runningBalanceCents < 0 ? CREDIT : MUTED });
    } else {
      w.text(e.studentName ?? "", cols[2].x, y, { size: 9, color: MUTED, maxWidth: cols[2].w });
      w.text(formatCents(e.deltaCents), cols[3].x, y, { size: 9.5, align: "right" });
    }
    y -= rowH;
    w.rule(y + 5);
    y -= 7;
  }

  // Invoice: totals under the table.
  if (!statement) {
    ensure(90);
    y -= 6;
    const tx = W - M - 220;
    const totals: [string, string, boolean][] = [
      ["Charges this month", formatCents(st.chargedCents), false],
      ["Previous balance", balanceText(st.openingBalanceCents), false],
      ["Payments received", minus(st.paidCents), false],
    ];
    for (const [k, v] of totals) {
      w.text(k, tx, y, { size: 9.5, color: MUTED });
      w.text(v, W - M, y, { size: 9.5, align: "right" });
      y -= 15;
    }
    w.rule(y + 7, tx, W - M, INK, 0.9);
    y -= 10;
    const b = balanceLabel(st.closingBalanceCents);
    w.text(st.closingBalanceCents > 0 ? "Amount due" : b.label, tx, y, { size: 11, bold: true });
    w.text(b.value, W - M, y, { size: 12.5, bold: true, align: "right", color: b.color });
    y -= 24;
  }

  // ---- footer on every page
  const payBits = [org.venmoHandle && `Venmo ${org.venmoHandle}`, org.zelleHandle && `Zelle ${org.zelleHandle}`].filter(Boolean).join("   ·   ");
  const n = w.pages.length;
  w.pages.forEach((p, i) => {
    w.page = p;
    const fyy = M + 18;
    w.rule(fyy + 22);
    if (payBits) {
      w.text("HOW TO PAY", M, fyy + 6, { size: 7.5, bold: true, color: FAINT });
      w.text(payBits, M + 62, fyy + 6, { size: 9, maxWidth: 330 });
    }
    const q = org.replyToEmail ? `Questions? ${org.replyToEmail}` : "Thank you";
    w.text(q, M, fyy - 8, { size: 8.5, color: MUTED, maxWidth: 380 });
    w.text(`Page ${i + 1} of ${n}`, W - M, fyy - 8, { size: 8.5, color: FAINT, align: "right" });
  });

  return doc.save();
}

function minus(cents: number) {
  return cents === 0 ? formatCents(0) : `-${formatCents(cents)}`;
}

function balanceText(cents: number) {
  if (cents > 0) return formatCents(cents);
  if (cents < 0) return `${formatCents(-cents)} CR`;
  return formatCents(0);
}
