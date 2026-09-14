"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/db";
import { RoleError, requireSession, requireWriter } from "@/src/auth/current";
import { AiError, aiConfigured } from "@/src/ai/generate";
import { discardDraft, draftExpenseFromReceipt, markApproved } from "@/src/ai/drafts";
import { FileError, storeFile } from "@/src/services/files";
import { setYearReported } from "@/src/services/taxFiling";
import { ExpenseError, TREATMENTS, type ExpenseInput, type TaxTreatment, createCategory, createExpense, createRecurring, runRecurring, setTaxYear, updateExpense, voidExpense } from "@/src/services/expenses";

export interface ActionState { error?: string; ok?: string; draftId?: string }

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
function cents(s: string): number { return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : NaN; }
function friendly(e: unknown): ActionState {
  if (e instanceof ExpenseError || e instanceof FileError || e instanceof AiError || e instanceof RoleError) return { error: e.message };
  throw e;
}
function readExpense(fd: FormData): ExpenseInput {
  const amountCents = cents(str(fd, "amount"));
  if (Number.isNaN(amountCents)) throw new ExpenseError("Amount must be a number like 18.49");
  const t = str(fd, "taxTreatment") as TaxTreatment;
  const bp = str(fd, "businessPercent");
  return {
    spentOn: str(fd, "spentOn"), description: str(fd, "description"), vendorName: str(fd, "vendor") || null, amountCents, categoryId: str(fd, "categoryId"),
    taxTreatment: TREATMENTS.includes(t) ? t : "BUSINESS_DIRECT", businessPercent: bp ? Number(bp) : null, paymentSourceId: str(fd, "paymentSourceId") || null,
    receiptFileId: str(fd, "receiptFileId") || null, notes: str(fd, "notes") || null, tutorId: str(fd, "tutorId") || null,
  };
}
function refresh() { revalidatePath("/expenses"); revalidatePath("/expenses/tax"); revalidatePath("/reports"); }

export async function createExpenseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  try {
    const input = readExpense(fd);
    const receipt = fd.get("receipt");
    if (receipt instanceof File && receipt.size > 0) {
      const f = await storeFile(prisma, { organizationId: s.organizationId, name: receipt.name, mimeType: receipt.type, data: new Uint8Array(await receipt.arrayBuffer()), uploadedById: s.userId });
      input.receiptFileId = f.id;
    }
    await createExpense(prisma, s.organizationId, input, s.userId);
    const draftId = str(fd, "draftId");
    if (draftId) await markApproved(prisma, draftId);
  } catch (e) { return friendly(e); }
  refresh();
  return { ok: "Expense recorded" };
}

export async function updateExpenseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const id = str(fd, "expenseId");
  try {
    const input = readExpense(fd);
    const receipt = fd.get("receipt");
    if (receipt instanceof File && receipt.size > 0) {
      const f = await storeFile(prisma, { organizationId: s.organizationId, name: receipt.name, mimeType: receipt.type, data: new Uint8Array(await receipt.arrayBuffer()), uploadedById: s.userId });
      input.receiptFileId = f.id;
    }
    await updateExpense(prisma, s.organizationId, id, input);
  } catch (e) { return friendly(e); }
  refresh(); revalidatePath(`/expenses/${id}`);
  return { ok: "Saved" };
}

export async function voidExpenseAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  await voidExpense(prisma, s.organizationId, str(fd, "expenseId"), str(fd, "reason") || "Voided");
  refresh();
  redirect("/expenses");
}

/** Upload a receipt and let the model read it. Returns the draft to prefill the form. */
export async function receiptDraftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  if (!aiConfigured()) return { error: "AI is not configured. Set GEMINI_API_KEY on the server to turn it on." };
  const receipt = fd.get("receipt");
  if (!(receipt instanceof File) || receipt.size === 0) return { error: "Choose a receipt photo or PDF" };
  try {
    const f = await storeFile(prisma, { organizationId: s.organizationId, name: receipt.name, mimeType: receipt.type, data: new Uint8Array(await receipt.arrayBuffer()), uploadedById: s.userId });
    const d = await draftExpenseFromReceipt(prisma, f.id, s.userId);
    revalidatePath("/expenses");
    return { ok: "Read the receipt. Check the details below, then record.", draftId: d.id };
  } catch (e) { return friendly(e); }
}

export async function discardExpenseDraftAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const d = await prisma.draft.findFirst({ where: { id: str(fd, "draftId"), organizationId: s.organizationId } });
  if (d) await discardDraft(prisma, d.id);
  revalidatePath("/expenses");
}

export async function createCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const t = str(fd, "defaultTaxTreatment") as TaxTreatment;
  try { await createCategory(prisma, s.organizationId, { name: str(fd, "name"), defaultTaxTreatment: TREATMENTS.includes(t) ? t : "BUSINESS_DIRECT", scheduleCLine: str(fd, "scheduleCLine") || null }); }
  catch (e) { return friendly(e); }
  refresh();
  return { ok: "Category added" };
}

export async function createRecurringAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const amountCents = cents(str(fd, "amount"));
  if (Number.isNaN(amountCents)) return { error: "Amount must be a number like 15.99" };
  const t = str(fd, "taxTreatment") as TaxTreatment;
  const bp = str(fd, "businessPercent");
  try {
    await createRecurring(prisma, s.organizationId, {
      description: str(fd, "description"), vendorName: str(fd, "vendor") || null, amountCents, categoryId: str(fd, "categoryId"),
      taxTreatment: TREATMENTS.includes(t) ? t : "BUSINESS_DIRECT", businessPercent: bp ? Number(bp) : null, paymentSourceId: str(fd, "paymentSourceId") || null,
      frequency: str(fd, "frequency") === "YEARLY" ? "YEARLY" : "MONTHLY", startOn: str(fd, "startOn"), endsOn: str(fd, "endsOn") || null,
    });
  } catch (e) { return friendly(e); }
  revalidatePath("/expenses/recurring");
  return { ok: "Recurring expense added. Run it to create the entries that are due." };
}

export async function runRecurringAction(): Promise<void> {
  const s = await requireWriter();
  await runRecurring(prisma, s.organizationId, new Date());
  refresh(); revalidatePath("/expenses/recurring");
}

export async function stopRecurringAction(fd: FormData): Promise<void> {
  const s = await requireWriter();
  await prisma.recurringExpense.updateMany({ where: { id: str(fd, "id"), organizationId: s.organizationId }, data: { active: false } });
  revalidatePath("/expenses/recurring");
}

export async function taxYearAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let s;
  try { s = await requireWriter(); } catch (e) { if (e instanceof RoleError) return { error: e.message }; throw e; }
  const year = Number(str(fd, "year"));
  const pct = str(fd, "homeOfficePercent");
  try {
    await setTaxYear(prisma, s.organizationId, year, {
      homeSqft: str(fd, "homeSqft") ? Number(str(fd, "homeSqft")) : null, officeSqft: str(fd, "officeSqft") ? Number(str(fd, "officeSqft")) : null,
      homeOfficeBps: pct ? Math.round(Number(pct) * 100) : null, filed: str(fd, "filed") === "on",
    });
  } catch (e) { return friendly(e); }
  refresh();
  return { ok: "Tax year saved" };
}

export async function setYearReportedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requireWriter();
    const year = Number(fd.get("year"));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Pick a year" };
    const reported = fd.get("reported") === "1";
    const r = await setYearReported(prisma, s.organizationId, year, reported);
    revalidatePath("/expenses/tax");
    revalidatePath("/payments");
    return { ok: reported ? `Marked ${r.payments} payments and ${r.expenses} expenses` : `Unmarked ${r.payments} payments and ${r.expenses} expenses` };
  } catch (e) {
    if (e instanceof RoleError) return { error: e.message };
    throw e;
  }
}
