/**
 * The family sign-up link. The owner turns it on and gets /join/CODE to share;
 * a family fills in the form and a student with a new family account and a
 * parent contact appears, marked as coming from the form.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { EmailError, emailConfigured, sendEmail } from "../email/send";
import { PeopleError, createStudent } from "./people";

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
  const noteLines = [
    `Signed up through the family form on ${day}.`,
    input.subjects?.trim() ? `Wants help with: ${input.subjects.trim()}` : null,
    input.goals?.trim() ? `Goals: ${input.goals.trim()}` : null,
  ].filter(Boolean).join("\n");

  let student;
  try {
    student = await createStudent(db, org.id, {
      firstName: input.studentFirstName,
      lastName: input.studentLastName,
      grade: input.grade,
      schoolName: input.school,
      email: input.studentEmail,
      phone: input.studentPhone,
      defaultSubject: input.subjects?.trim().slice(0, 120) || null,
      notes: noteLines,
    }, { guardian: { name: input.parentName, email: input.parentEmail, phone: input.parentPhone } });
  } catch (e) {
    if (e instanceof PeopleError) throw new IntakeError(e.message);
    throw e;
  }

  // Confirmation to the family, and a heads-up to the school. A mail failure never loses the sign-up.
  if (emailConfigured()) {
    const who = `${student.firstName} ${student.lastName}`;
    try {
      await sendEmail(db, org.id, "INTAKE_CONFIRMATION", {
        to: input.parentEmail.trim(),
        subject: `${org.name}: we received ${student.firstName}'s sign-up`,
        text: [`Hello ${input.parentName.trim().split(" ")[0]},`, "", `Thank you for signing up ${who}. We will be in touch soon to set up the first lesson.`, "", org.phone ? `Questions? Reply to this email or call ${org.phone}.` : "Questions? Reply to this email.", "", org.name].join("\n"),
        replyTo: org.replyToEmail,
      }, { type: "student", id: student.id });
      const owner = await db.membership.findFirst({ where: { organizationId: org.id, role: "OWNER" }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
      const to = org.replyToEmail ?? owner?.user.email;
      if (to) {
        await sendEmail(db, org.id, "OTHER", {
          to,
          subject: `New sign-up: ${who}`,
          text: [`${who} signed up through the family form.`, "", `Parent: ${input.parentName.trim()} · ${input.parentEmail.trim()}${input.parentPhone ? ` · ${input.parentPhone}` : ""}`, input.grade ? `Grade: ${input.grade}` : null, noteLines].filter(Boolean).join("\n"),
        }, { type: "student", id: student.id });
      }
    } catch (e) {
      if (!(e instanceof EmailError)) throw e;
    }
  }
  return student;
}
