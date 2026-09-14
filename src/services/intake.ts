/**
 * The family sign-up link. The owner turns it on and gets /join/CODE to share;
 * a family fills in the form and an inquiry lands in the pipeline, marked as
 * coming from the form. Enrolling it there makes the student and the account.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { EmailError, emailConfigured, sendEmail } from "../email/send";
import { LeadError, createLead } from "./leads";

export class IntakeError extends Error {}

export async function enableIntake(db: PrismaClient, organizationId: string, regenerate = false) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { intakeCode: true } });
  const intakeCode = !org.intakeCode || regenerate ? randomBytes(15).toString("base64url") : org.intakeCode;
  return db.organization.update({ where: { id: organizationId }, data: { studentIntakeEnabled: true, intakeCode } });
}

export async function disableIntake(db: PrismaClient, organizationId: string) {
  return db.organization.update({ where: { id: organizationId }, data: { studentIntakeEnabled: false } });
}

export async function schoolForIntake(db: PrismaClient, code: string) {
  if (!code || code.length > 64) return null;
  const org = await db.organization.findUnique({ where: { intakeCode: code }, select: { id: true, name: true, studentIntakeEnabled: true, replyToEmail: true, phone: true } });
  return org?.studentIntakeEnabled ? org : null;
}

export interface IntakeInput {
  studentFirstName: string;
  studentLastName: string;
  grade?: string;
  school?: string;
  studentEmail?: string;
  studentPhone?: string;
  subjects?: string;
  goals?: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  consent: boolean;
}

export async function submitIntake(db: PrismaClient, code: string, input: IntakeInput, now = new Date()) {
  const org = await schoolForIntake(db, code);
  if (!org) throw new IntakeError("This sign-up link is not active. Ask the school for a current one.");
  if (!input.consent) throw new IntakeError("Please agree to be contacted about lessons");
  if (!input.parentName.trim()) throw new IntakeError("Parent or guardian name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.parentEmail.trim())) throw new IntakeError("Enter a valid parent email");

  const day = now.toISOString().slice(0, 10);
  let lead;
  try {
    lead = await createLead(db, org.id, {
      studentFirstName: input.studentFirstName, studentLastName: input.studentLastName, grade: input.grade, schoolName: input.school,
      studentEmail: input.studentEmail, studentPhone: input.studentPhone, parentName: input.parentName, parentEmail: input.parentEmail, parentPhone: input.parentPhone,
      subjects: input.subjects, goals: input.goals, source: "form", notes: `Signed up through the family form on ${day}.`,
    });
  } catch (e) {
    if (e instanceof LeadError) throw new IntakeError(e.message);
    throw e;
  }

  // Confirmation to the family, and a heads-up to the school. A mail failure never loses the sign-up.
  if (emailConfigured()) {
    const who = `${lead.studentFirstName} ${lead.studentLastName}`;
    try {
      await sendEmail(db, org.id, "INTAKE_CONFIRMATION", {
        to: input.parentEmail.trim(),
        subject: `${org.name}: we received ${lead.studentFirstName}'s sign-up`,
        text: [`Hello ${input.parentName.trim().split(" ")[0]},`, "", `Thank you for signing up ${who}. We will be in touch soon to set up the first lesson.`, "", org.phone ? `Questions? Reply to this email or call ${org.phone}.` : "Questions? Reply to this email.", "", org.name].join("\n"),
        replyTo: org.replyToEmail,
      }, { type: "lead", id: lead.id });
      const owner = await db.membership.findFirst({ where: { organizationId: org.id, role: "OWNER" }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
      const to = org.replyToEmail ?? owner?.user.email;
      if (to) {
        await sendEmail(db, org.id, "OTHER", {
          to,
          subject: `New inquiry: ${who}`,
          text: [`${who} signed up through the family form. It is waiting in Leads.`, "", `Parent: ${input.parentName.trim()} · ${input.parentEmail.trim()}${input.parentPhone ? ` · ${input.parentPhone}` : ""}`, input.grade ? `Grade: ${input.grade}` : null, lead.subjects ? `Wants help with: ${lead.subjects}` : null, lead.goals ? `Goals: ${lead.goals}` : null].filter(Boolean).join("\n"),
        }, { type: "lead", id: lead.id });
      }
    } catch (e) {
      if (!(e instanceof EmailError)) throw e;
    }
  }
  return lead;
}
