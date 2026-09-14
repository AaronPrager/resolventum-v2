/**
 * Loads what a statement or invoice needs and renders it, one account or many.
 */
import { zipSync } from "fflate";
import type { PrismaClient } from "../../generated/prisma/client";
import { accountStatement } from "../services/statement";
import { accountBalances } from "../services/balances";
import { invoiceNumber, renderAccountPdf } from "./accountPdf";
import { loadLogo } from "../services/branding";

export class DocumentError extends Error {}

export interface DocRequest {
  kind: "statement" | "invoice";
  /** Statement range, "YYYY-MM-DD". Empty means open-ended. */
  from?: string | null;
  to?: string | null;
  /** Invoice month, "YYYY-MM". */
  month?: string | null;
  /** The school's calendar day, for the issue date. */
  today: Date;
}

const dateOnly = (s: string) => new Date(`${s}T00:00:00Z`);
const isDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function monthRange(month: string): { from: Date; to: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DocumentError("Month must look like 2026-09");
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)) };
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "account";
}

export async function accountDocument(db: PrismaClient, organizationId: string, accountId: string, req: DocRequest): Promise<{ bytes: Uint8Array; filename: string }> {
  const account = await db.account.findFirst({
    where: { id: accountId, organizationId },
    include: { organization: true, guardians: { orderBy: [{ isBilling: "desc" }, { isPrimary: "desc" }, { createdAt: "asc" }] } },
  });
  if (!account) throw new DocumentError("Account not found");

  let range: { from: Date | null; to: Date | null };
  let label: string;
  if (req.kind === "invoice") {
    const month = req.month ?? req.today.toISOString().slice(0, 7);
    range = monthRange(month);
    label = month;
  } else {
    range = { from: isDate(req.from) ? dateOnly(req.from!) : null, to: isDate(req.to) ? dateOnly(req.to!) : null };
    label = [req.from, req.to].filter(isDate).join(" to ") || "all";
  }
  const st = await accountStatement(db, accountId, range);
  if (!st) throw new DocumentError("Account not found");

  const billing = account.guardians[0] ?? null;
  const org = account.organization;
  const bytes = await renderAccountPdf({
    kind: req.kind,
    org: { name: org.name, legalName: org.legalName, address: org.address, phone: org.phone, replyToEmail: org.replyToEmail, venmoHandle: org.venmoHandle, zelleHandle: org.zelleHandle },
    accountName: account.name,
    billTo: billing ? { name: billing.name, email: billing.email, phone: billing.phone, address: billing.address } : null,
    st,
    issuedOn: req.today,
    number: req.kind === "invoice" ? invoiceNumber(account.id, label) : undefined,
    logo: await loadLogo(db, organizationId),
  });
  const title = req.kind === "invoice" ? "Invoice" : "Statement";
  return { bytes, filename: `${title} - ${safeName(account.name)} - ${label}.pdf` };
}

/**
 * One ZIP for many accounts. Statements: every account with a balance or credit
 * today. Invoices: every account with a charge in the month, or a balance still owed.
 */
export async function bulkDocuments(db: PrismaClient, organizationId: string, req: DocRequest): Promise<{ bytes: Uint8Array; filename: string; count: number }> {
  const balances = await accountBalances(db, organizationId, req.today);
  let ids: string[];
  if (req.kind === "invoice") {
    const { from, to } = monthRange(req.month ?? req.today.toISOString().slice(0, 7));
    const charged = await db.charge.findMany({ where: { organizationId, voidedAt: null, chargedOn: { gte: from, lte: to } }, select: { accountId: true }, distinct: ["accountId"] });
    const set = new Set([...charged.map((c) => c.accountId), ...balances.filter((b) => b.balanceCents > 0).map((b) => b.accountId)]);
    ids = [...set];
  } else {
    ids = balances.filter((b) => b.balanceCents !== 0).map((b) => b.accountId);
  }
  if (ids.length === 0) throw new DocumentError(req.kind === "invoice" ? "No account has charges or a balance for that month" : "Every account is at zero");

  const files: Record<string, Uint8Array> = {};
  for (const id of ids) {
    const d = await accountDocument(db, organizationId, id, req);
    let name = d.filename;
    for (let i = 2; files[name]; i++) name = d.filename.replace(/\.pdf$/, ` (${i}).pdf`);
    files[name] = d.bytes;
  }
  const label = req.kind === "invoice" ? req.month ?? req.today.toISOString().slice(0, 7) : req.today.toISOString().slice(0, 10);
  return { bytes: zipSync(files, { level: 0 }), filename: `${req.kind === "invoice" ? "Invoices" : "Statements"} ${label}.zip`, count: ids.length };
}
