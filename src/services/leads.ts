/**
 * The pipeline: a family asks about lessons, a consult or trial gets booked,
 * and they enroll or say no. Enrolling makes the student and the family account
 * from what the lead already holds. A lost lead keeps its reason.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { PeopleError, createStudent } from "./people";

export class LeadError extends Error {}

export const LEAD_STATUSES = ["INQUIRY", "CONSULT_BOOKED", "TRIAL", "ENROLLED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_LABEL: Record<LeadStatus, string> = { INQUIRY: "Inquiry", CONSULT_BOOKED: "Consult booked", TRIAL: "Trial lesson", ENROLLED: "Enrolled", LOST: "Lost" };

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export interface LeadInput {
  studentFirstName: string;
  studentLastName: string;
  grade?: string | null;
  schoolName?: string | null;
  studentEmail?: string | null;
  studentPhone?: string | null;
  parentName: string;
  parentEmail?: string | null;
  parentPhone?: string | null;
  subjects?: string | null;
  goals?: string | null;
  source?: string | null;
  notes?: string | null;
}

function leadData(input: LeadInput) {
  const studentFirstName = input.studentFirstName.trim();
  const studentLastName = input.studentLastName.trim();
  const parentName = input.parentName.trim();
  if (!studentFirstName || !studentLastName) throw new LeadError("The student's first and last name are required");
  if (!parentName) throw new LeadError("Parent or guardian name is required");
  const parentEmail = clean(input.parentEmail)?.toLowerCase() ?? null;
  if (parentEmail && !isEmail(parentEmail)) throw new LeadError("Parent email does not look right");
  const studentEmail = clean(input.studentEmail)?.toLowerCase() ?? null;
  if (studentEmail && !isEmail(studentEmail)) throw new LeadError("Student email does not look right");
  return {
    studentFirstName, studentLastName, grade: clean(input.grade), schoolName: clean(input.schoolName), studentEmail, studentPhone: clean(input.studentPhone),
    parentName, parentEmail, parentPhone: clean(input.parentPhone), subjects: clean(input.subjects), goals: clean(input.goals), source: clean(input.source), notes: clean(input.notes),
  };
}

export async function createLead(db: PrismaClient, organizationId: string, input: LeadInput, createdById?: string | null) {
  return db.lead.create({ data: { ...leadData(input), organizationId, createdById: createdById ?? null } });
}

export async function updateLead(db: PrismaClient, organizationId: string, leadId: string, input: LeadInput) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadError("Lead not found");
  return db.lead.update({ where: { id: leadId }, data: leadData(input) });
}

/** Move along the pipeline. A consult or trial takes a time; lost takes a reason. Enrolled goes through enrollLead. */
export async function setLeadStatus(db: PrismaClient, organizationId: string, leadId: string, status: LeadStatus, extra: { consultAt?: Date | null; lostReason?: string | null } = {}) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadError("Lead not found");
  if (!LEAD_STATUSES.includes(status)) throw new LeadError("Pick a stage");
  if (status === "ENROLLED") throw new LeadError("Use enroll to make the student");
  if (status === "LOST" && !clean(extra.lostReason)) throw new LeadError("Say why they did not go ahead, in a few words");
  if ((status === "CONSULT_BOOKED" || status === "TRIAL") && extra.consultAt !== undefined && extra.consultAt !== null && Number.isNaN(extra.consultAt.getTime())) throw new LeadError("The time is not valid");
  return db.lead.update({
    where: { id: leadId },
    data: {
      status,
      ...(extra.consultAt !== undefined ? { consultAt: extra.consultAt } : {}),
      lostReason: status === "LOST" ? clean(extra.lostReason) : null,
    },
  });
}

/**
 * Enroll: make the student, on a new family account with the parent as the
 * main contact or on an existing account, and close the lead.
 */
export async function enrollLead(db: PrismaClient, organizationId: string, leadId: string, family: { accountId: string } | { accountName?: string | null } = {}) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadError("Lead not found");
  if (lead.status === "ENROLLED" && lead.studentId) throw new LeadError("Already enrolled");
  const day = new Date().toISOString().slice(0, 10);
  const notes = [
    `Enrolled from an inquiry on ${day}${lead.source ? ` (${lead.source})` : ""}.`,
    lead.subjects ? `Wants help with: ${lead.subjects}` : null,
    lead.goals ? `Goals: ${lead.goals}` : null,
    lead.notes,
  ].filter(Boolean).join("\n");
  let student;
  try {
    student = await createStudent(db, organizationId, {
      firstName: lead.studentFirstName, lastName: lead.studentLastName, grade: lead.grade, schoolName: lead.schoolName, email: lead.studentEmail, phone: lead.studentPhone,
      defaultSubject: lead.subjects?.slice(0, 120) ?? null, notes,
    }, "accountId" in family ? family : { accountName: family.accountName, guardian: { name: lead.parentName, email: lead.parentEmail, phone: lead.parentPhone } });
  } catch (e) {
    if (e instanceof PeopleError) throw new LeadError(e.message);
    throw e;
  }
  await db.lead.update({ where: { id: leadId }, data: { status: "ENROLLED", studentId: student.id, lostReason: null } });
  return student;
}

export async function deleteLead(db: PrismaClient, organizationId: string, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadError("Lead not found");
  await db.lead.delete({ where: { id: leadId } });
}

/** Open leads first, newest first within a stage; closed ones (enrolled, lost) only when asked. */
export async function listLeads(db: PrismaClient, organizationId: string, opts: { includeClosed?: boolean } = {}) {
  return db.lead.findMany({
    where: { organizationId, ...(opts.includeClosed ? {} : { status: { in: ["INQUIRY", "CONSULT_BOOKED", "TRIAL"] } }) },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function leadCounts(db: PrismaClient, organizationId: string, since?: Date) {
  const rows = await db.lead.groupBy({ by: ["status"], where: { organizationId, ...(since ? { createdAt: { gte: since } } : {}) }, _count: { _all: true } });
  const out: Record<LeadStatus, number> = { INQUIRY: 0, CONSULT_BOOKED: 0, TRIAL: 0, ENROLLED: 0, LOST: 0 };
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}
