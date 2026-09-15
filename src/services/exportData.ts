/**
 * Every table as CSV, and the whole school as one ZIP. No upgrade prompt,
 * no hostage-taking: the owner's data leaves whenever they ask.
 */
import { zipSync } from "fflate";
import type { PrismaClient } from "../../generated/prisma/client";
import { money, toCsv } from "../lib/csv";
import { dateOnlyStr, localDateStr, localTimeStr } from "../lib/tz";
import { accountBalances } from "./balances";
import { LEAD_LABEL, type LeadStatus } from "./leads";

export type ExportKind = "students" | "accounts" | "ledger" | "payments" | "lessons" | "expenses" | "tutors" | "leads" | "notes";
export const EXPORT_KINDS: ExportKind[] = ["students", "accounts", "ledger", "payments", "lessons", "expenses", "tutors", "leads", "notes"];

const name = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;

export async function exportCsv(db: PrismaClient, organizationId: string, kind: ExportKind, opts: { timeZone: string; today: Date }): Promise<{ filename: string; csv: string }> {
  const tz = opts.timeZone;
  const day = dateOnlyStr(opts.today);
  switch (kind) {
    case "students": {
      const rows = await db.student.findMany({ where: { organizationId, deletedAt: null }, include: { account: { include: { guardians: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
      return { filename: `students-${day}.csv`, csv: toCsv(
        ["First name", "Last name", "Status", "Archived", "Grade", "School", "Date of birth", "Student email", "Student phone", "Usual subject", "Usual price", "Family account", "Parent", "Parent email", "Parent phone", "Difficulties", "Notes"],
        rows.map((s) => { const g = s.account.guardians[0]; return [s.firstName, s.lastName, s.status.toLowerCase(), s.archivedAt ? "yes" : "", s.grade, s.schoolName, s.dateOfBirth, s.email, s.phone, s.defaultSubject, money(s.defaultPriceCents), s.account.name, g?.name, g?.email, g?.phone, s.difficulties, s.notes]; }),
      ) };
    }
    case "accounts": {
      const rows = await accountBalances(db, organizationId, opts.today);
      const accounts = await db.account.findMany({ where: { organizationId }, include: { guardians: true } });
      return { filename: `accounts-${day}.csv`, csv: toCsv(
        ["Account", "Students", "Archived", "Charged", "Paid", "Balance", "Contacts", "Email reminders", "Email notes"],
        rows.map((b) => { const a = accounts.find((x) => x.id === b.accountId); return [b.name, b.studentNames.join("; "), b.archived ? "yes" : "", money(b.chargedCents), money(b.paidCents), money(b.balanceCents), a?.guardians.map((g) => [g.name, g.email, g.phone].filter(Boolean).join(" ")).join("; "), a?.emailReminders ? "on" : "off", a?.emailNotes ? "on" : "off"]; }),
      ) };
    }
    case "ledger": {
      const [charges, payments] = await Promise.all([
        db.charge.findMany({ where: { organizationId }, include: { account: { select: { name: true } }, student: { select: { firstName: true, lastName: true } } } }),
        db.payment.findMany({ where: { organizationId }, include: { account: { select: { name: true } } } }),
      ]);
      const rows = [
        ...charges.map((c) => ({ date: c.chargedOn, account: c.account.name, kind: `charge: ${c.kind.toLowerCase()}`, student: c.student ? name(c.student) : "", description: c.description, delta: c.amountCents, method: "", reference: "", voided: c.voidedAt ? c.voidReason ?? "voided" : "", id: c.id, created: c.createdAt })),
        ...payments.map((p) => ({ date: p.paidOn, account: p.account.name, kind: p.kind === "REFUND" ? "refund" : "payment", student: "", description: p.kind === "REFUND" ? p.refundReason ?? "Refund" : p.notes ?? "Payment", delta: -p.amountCents, method: p.method, reference: p.reference ?? "", voided: p.voidedAt ? p.voidReason ?? "voided" : "", id: p.id, created: p.createdAt })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.created.getTime() - b.created.getTime());
      return { filename: `ledger-${day}.csv`, csv: toCsv(
        ["Date", "Account", "Entry", "Student", "Description", "Balance change", "Method", "Reference", "Voided", "Id"],
        rows.map((r) => [r.date, r.account, r.kind, r.student, r.description, money(r.delta), r.method, r.reference, r.voided, r.id]),
      ) };
    }
    case "payments": {
      const rows = await db.payment.findMany({ where: { organizationId }, include: { account: { select: { name: true } } }, orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }] });
      return { filename: `payments-${day}.csv`, csv: toCsv(
        ["Date", "Account", "Kind", "Amount", "Method", "Reference", "Notes", "Refund reason", "Voided", "Id"],
        rows.map((p) => [p.paidOn, p.account.name, p.kind.toLowerCase(), money(Math.abs(p.amountCents)), p.method.toLowerCase(), p.reference, p.notes, p.refundReason, p.voidedAt ? p.voidReason ?? "voided" : "", p.id]),
      ) };
    }
    case "lessons": {
      const rows = await db.lesson.findMany({ where: { organizationId, deletedAt: null }, include: { tutor: { select: { name: true } }, category: { select: { name: true } }, students: { include: { student: { select: { firstName: true, lastName: true } }, charge: { select: { amountCents: true, voidedAt: true } } } } }, orderBy: { startsAt: "asc" } });
      const out: (string | number | null)[][] = [];
      for (const l of rows) {
        if (l.students.length === 0) out.push([localDateStr(l.startsAt, tz), l.allDay ? "" : localTimeStr(l.startsAt, tz), l.durationMin, l.subject, l.category?.name ?? null, "", l.tutor?.name ?? null, l.status.toLowerCase(), l.locationType.toLowerCase().replace("_", " "), "", "", l.seriesId ? "yes" : "", l.notes, l.id]);
        for (const s of l.students) out.push([localDateStr(l.startsAt, tz), l.allDay ? "" : localTimeStr(l.startsAt, tz), l.durationMin, l.subject, l.category?.name ?? null, name(s.student), l.tutor?.name ?? null, s.status.toLowerCase(), l.locationType.toLowerCase().replace("_", " "), money(s.priceCents), s.charge && !s.charge.voidedAt ? money(s.charge.amountCents) : "0.00", l.seriesId ? "yes" : "", l.notes, l.id]);
      }
      return { filename: `lessons-${day}.csv`, csv: toCsv(["Date", "Time", "Minutes", "Subject", "Category", "Student", "Tutor", "Status", "Where", "Price", "Charged", "Weekly", "Notes", "Lesson id"], out) };
    }
    case "expenses": {
      const rows = await db.expense.findMany({ where: { organizationId }, include: { vendor: true, category: true, paymentSource: true, tutor: { select: { name: true } } }, orderBy: { spentOn: "asc" } });
      return { filename: `expenses-${day}.csv`, csv: toCsv(
        ["Date", "Vendor", "Description", "Category", "Amount", "Tax treatment", "Business %", "Paid from", "Tutor", "Notes", "Voided", "Id"],
        rows.map((e) => [e.spentOn, e.vendor?.name, e.description, e.category.name, money(e.amountCents), e.taxTreatment.toLowerCase().replace(/_/g, " "), e.businessPercent, e.paymentSource?.name, e.tutor?.name, e.notes, e.voidedAt ? e.voidReason ?? "voided" : "", e.id]),
      ) };
    }
    case "tutors": {
      const rows = await db.tutor.findMany({ where: { organizationId }, include: { payRates: true }, orderBy: { name: "asc" } });
      return { filename: `tutors-${day}.csv`, csv: toCsv(
        ["Name", "Email", "Phone", "Subjects", "Client rate per hour", "Pay per hour", "Pay percent", "Pay by subject", "Availability", "Timezone", "Archived", "Notes"],
        rows.map((t) => [t.name, t.email, t.phone, t.subjects.join("; "), money(t.hourlyClientRateCents), money(t.hourlyPayRateCents), t.payPercent, t.payRates.map((r) => `${r.subject}: ${r.payPercent != null ? `${r.payPercent}%` : money(r.hourlyPayRateCents)}`).join("; "), t.availability, t.timezone, t.archivedAt ? "yes" : "", t.notes]),
      ) };
    }
    case "leads": {
      const rows = await db.lead.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
      return { filename: `leads-${day}.csv`, csv: toCsv(
        ["Created", "Stage", "Student", "Grade", "School", "Parent", "Parent email", "Parent phone", "Subjects", "Goals", "Source", "Consult", "Lost reason", "Notes"],
        rows.map((l) => [l.createdAt, LEAD_LABEL[l.status as LeadStatus], `${l.studentFirstName} ${l.studentLastName}`, l.grade, l.schoolName, l.parentName, l.parentEmail, l.parentPhone, l.subjects, l.goals, l.source, l.consultAt ? `${localDateStr(l.consultAt, tz)} ${localTimeStr(l.consultAt, tz)}` : "", l.lostReason, l.notes]),
      ) };
    }
    case "notes": {
      const rows = await db.sessionNote.findMany({ where: { organizationId }, include: { student: { select: { firstName: true, lastName: true } }, lesson: { select: { startsAt: true, subject: true, tutor: { select: { name: true } } } } }, orderBy: [{ notedOn: "asc" }, { createdAt: "asc" }] });
      return { filename: `session-notes-${day}.csv`, csv: toCsv(
        ["Date", "Student", "Lesson", "Tutor", "Covered", "Homework", "Engagement", "Win", "Struggle", "Next goal", "Shared", "Shared to"],
        rows.map((n) => [n.notedOn, name(n.student), n.lesson ? `${n.lesson.subject} ${localTimeStr(n.lesson.startsAt, tz)}` : "general", n.lesson?.tutor?.name, n.covered, n.homework, n.engagement, n.win, n.struggle, n.nextGoal, n.sharedAt, n.sharedTo]),
      ) };
    }
  }
}

/** Everything, one CSV per table, zipped. */
export async function fullExport(db: PrismaClient, organizationId: string, opts: { timeZone: string; today: Date }) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  const files: Record<string, Uint8Array> = {};
  for (const kind of EXPORT_KINDS) {
    const f = await exportCsv(db, organizationId, kind, opts);
    files[f.filename] = new TextEncoder().encode(f.csv);
  }
  const day = dateOnlyStr(opts.today);
  return { bytes: zipSync(files, { level: 6 }), filename: `${org.name} export ${day}.zip` };
}
