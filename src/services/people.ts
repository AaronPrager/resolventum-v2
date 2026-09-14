/**
 * Students, family accounts, and parent contacts: the records a school edits
 * by hand. (Progress notes were retired in favour of session notes; old rows
 * stay readable on the student page.) Money never moves here except when a student changes
 * family, and then the rules are in moveStudent.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { rebuildAccountAllocations } from "./allocation";

export class PeopleError extends Error {}

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

// ---------------------------------------------------------------- students

export interface StudentInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  grade?: string | null;
  schoolName?: string | null;
  /** "YYYY-MM-DD" */
  dateOfBirth?: string | null;
  defaultSubject?: string | null;
  defaultPriceCents?: number | null;
  difficulties?: string | null;
  notes?: string | null;
  /** Left out = unchanged (or ACTIVE for a new student). */
  status?: "ACTIVE" | "PAUSED" | "GRADUATED";
}

export const STUDENT_STATUSES = ["ACTIVE", "PAUSED", "GRADUATED"] as const;
export const STUDENT_STATUS_LABEL: Record<(typeof STUDENT_STATUSES)[number], string> = { ACTIVE: "active", PAUSED: "paused", GRADUATED: "graduated" };

export interface GuardianInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  relationship?: string | null;
  isPrimary?: boolean;
  isBilling?: boolean;
  isEmergency?: boolean;
}

function studentData(input: StudentInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) throw new PeopleError("First name is required");
  if (!lastName) throw new PeopleError("Last name is required");
  const email = clean(input.email);
  if (email && !isEmail(email)) throw new PeopleError("Student email does not look right");
  const dob = clean(input.dateOfBirth);
  if (dob && !isDate(dob)) throw new PeopleError("Date of birth must be a date");
  const price = input.defaultPriceCents;
  if (price != null && (!Number.isInteger(price) || price < 0)) throw new PeopleError("Usual price must be zero or more");
  if (input.status !== undefined && !STUDENT_STATUSES.includes(input.status)) throw new PeopleError("Pick a status");
  return {
    firstName,
    lastName,
    email: email?.toLowerCase() ?? null,
    phone: clean(input.phone),
    grade: clean(input.grade),
    schoolName: clean(input.schoolName),
    dateOfBirth: dob ? new Date(`${dob}T00:00:00Z`) : null,
    defaultSubject: clean(input.defaultSubject),
    defaultPriceCents: price ?? null,
    difficulties: clean(input.difficulties),
    notes: clean(input.notes),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
}

function guardianData(input: GuardianInput) {
  const name = input.name.trim();
  if (!name) throw new PeopleError("Contact name is required");
  const email = clean(input.email);
  if (email && !isEmail(email)) throw new PeopleError("Contact email does not look right");
  return {
    name,
    email: email?.toLowerCase() ?? null,
    phone: clean(input.phone),
    address: clean(input.address),
    relationship: clean(input.relationship),
    isPrimary: !!input.isPrimary,
    isBilling: !!input.isBilling,
    isEmergency: !!input.isEmergency,
  };
}

/**
 * Add a student. Either joins an existing family account, or opens a new one
 * (named after the student unless a name is given) with an optional parent contact.
 */
export async function createStudent(
  db: PrismaClient,
  organizationId: string,
  input: StudentInput,
  family: { accountId: string } | { accountName?: string | null; guardian?: GuardianInput | null },
) {
  const data = studentData(input);
  if ("accountId" in family) {
    const account = await db.account.findFirst({ where: { id: family.accountId, organizationId } });
    if (!account) throw new PeopleError("Family account not found");
    return db.student.create({ data: { ...data, organizationId, accountId: account.id } });
  }
  const guardian = family.guardian && family.guardian.name.trim() ? guardianData({ ...family.guardian, isPrimary: true, isBilling: true }) : null;
  return db.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: { organizationId, name: clean(family.accountName) ?? `${data.firstName} ${data.lastName}` },
    });
    if (guardian) await tx.guardian.create({ data: { ...guardian, accountId: account.id } });
    return tx.student.create({ data: { ...data, organizationId, accountId: account.id } });
  });
}

export async function updateStudent(db: PrismaClient, organizationId: string, studentId: string, input: StudentInput) {
  const existing = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null } });
  if (!existing) throw new PeopleError("Student not found");
  return db.student.update({ where: { id: studentId }, data: studentData(input) });
}

/**
 * Put a student on another family account, or on a new account of their own.
 *
 * If the student was the only one on the old account, the whole account goes
 * with them: every charge, payment, and contact moves and the old account is
 * archived, so no money is left behind. Otherwise the family keeps its history
 * (past charges and all payments stay where they were paid) and only this
 * student's charges dated after today move to the new account.
 */
export async function moveStudent(
  db: PrismaClient,
  organizationId: string,
  studentId: string,
  to: { accountId: string } | { newAccountName?: string | null },
  today: Date,
): Promise<{ accountId: string; mergedWholeAccount: boolean; movedCharges: number }> {
  const student = await db.student.findFirst({ where: { id: studentId, organizationId, deletedAt: null }, include: { account: { include: { _count: { select: { students: { where: { deletedAt: null } } } } } } } });
  if (!student) throw new PeopleError("Student not found");
  const fromId = student.accountId;
  const alone = student.account._count.students === 1;

  let toId: string;
  if ("accountId" in to) {
    const target = await db.account.findFirst({ where: { id: to.accountId, organizationId } });
    if (!target) throw new PeopleError("Family account not found");
    if (target.id === fromId) throw new PeopleError("The student is already on that account");
    toId = target.id;
  } else {
    if (alone) throw new PeopleError("The student already has an account of their own");
    toId = (await db.account.create({ data: { organizationId, name: clean(to.newAccountName) ?? `${student.firstName} ${student.lastName}` } })).id;
  }

  let movedCharges = 0;
  await db.$transaction(async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { accountId: toId } });
    if (alone) {
      movedCharges = (await tx.charge.updateMany({ where: { accountId: fromId }, data: { accountId: toId } })).count;
      await tx.payment.updateMany({ where: { accountId: fromId }, data: { accountId: toId } });
      await tx.guardian.updateMany({ where: { accountId: fromId }, data: { accountId: toId, isPrimary: false, isBilling: false } });
      await tx.account.update({ where: { id: fromId }, data: { archivedAt: new Date(), notes: `Merged into another account on ${today.toISOString().slice(0, 10)}` } });
    } else {
      movedCharges = (await tx.charge.updateMany({ where: { accountId: fromId, studentId, chargedOn: { gt: today } }, data: { accountId: toId } })).count;
    }
  });
  await rebuildAccountAllocations(db, fromId);
  await rebuildAccountAllocations(db, toId);
  return { accountId: toId, mergedWholeAccount: alone, movedCharges };
}

// ---------------------------------------------------------------- accounts and contacts

export async function updateAccount(db: PrismaClient, organizationId: string, accountId: string, input: { name: string; notes?: string | null; emailReminders?: boolean; emailNotes?: boolean }) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new PeopleError("Account not found");
  const name = input.name.trim();
  if (!name) throw new PeopleError("Account name is required");
  return db.account.update({
    where: { id: accountId },
    data: {
      name, notes: clean(input.notes),
      ...(input.emailReminders !== undefined ? { emailReminders: input.emailReminders } : {}),
      ...(input.emailNotes !== undefined ? { emailNotes: input.emailNotes } : {}),
    },
  });
}

/** Only one primary and one billing contact per account: setting it here clears it elsewhere. */
async function exclusiveFlags(tx: Pick<PrismaClient, "guardian">, accountId: string, keepId: string, flags: { isPrimary: boolean; isBilling: boolean }) {
  if (flags.isPrimary) await tx.guardian.updateMany({ where: { accountId, id: { not: keepId } }, data: { isPrimary: false } });
  if (flags.isBilling) await tx.guardian.updateMany({ where: { accountId, id: { not: keepId } }, data: { isBilling: false } });
}

export async function addGuardian(db: PrismaClient, organizationId: string, accountId: string, input: GuardianInput) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId }, include: { _count: { select: { guardians: true } } } });
  if (!account) throw new PeopleError("Account not found");
  const data = guardianData({ ...input, isPrimary: input.isPrimary || account._count.guardians === 0 });
  return db.$transaction(async (tx) => {
    const g = await tx.guardian.create({ data: { ...data, accountId } });
    await exclusiveFlags(tx, accountId, g.id, data);
    return g;
  });
}

export async function updateGuardian(db: PrismaClient, organizationId: string, guardianId: string, input: GuardianInput) {
  const g = await db.guardian.findFirst({ where: { id: guardianId, account: { organizationId } } });
  if (!g) throw new PeopleError("Contact not found");
  const data = guardianData(input);
  return db.$transaction(async (tx) => {
    const updated = await tx.guardian.update({ where: { id: guardianId }, data });
    await exclusiveFlags(tx, g.accountId, g.id, data);
    return updated;
  });
}

export async function removeGuardian(db: PrismaClient, organizationId: string, guardianId: string) {
  const g = await db.guardian.findFirst({ where: { id: guardianId, account: { organizationId } }, include: { membership: true } });
  if (!g) throw new PeopleError("Contact not found");
  if (g.membership) throw new PeopleError("This contact has a sign-in for the family portal; remove that first");
  await db.guardian.delete({ where: { id: guardianId } });
  // Keep someone primary if anyone is left.
  if (g.isPrimary) {
    const next = await db.guardian.findFirst({ where: { accountId: g.accountId }, orderBy: { createdAt: "asc" } });
    if (next) await db.guardian.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
}
