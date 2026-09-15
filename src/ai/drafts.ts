/**
 * AI drafts. The model writes, a person approves. Every result is a Draft
 * row: what it is for, what the model said, and what it cost. Approving a
 * draft is what applies it (feedback saved, expense created, report ready
 * to send); discarding leaves a record.
 */
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyStr, localDateStr, localTimeStr } from "../lib/tz";
import { AiError, fileToPart, generateStructured } from "./generate";

// ---------------------------------------------------------------- schemas

export const ParentReportSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("The email body in plain text, ready to send, addressed to the parent"),
  highlights: z.array(z.string()).describe("Three to five short bullet points a parent would want to know"),
  next_focus: z.string().describe("One sentence on what the next few lessons will work on"),
});
export type ParentReport = z.infer<typeof ParentReportSchema>;

export const FeedbackSchema = z.object({
  comment: z.string().describe("Feedback for the student in a warm, specific, encouraging tone, plain text"),
  score: z.number().int().min(1).max(5).describe("1 to 5, where 5 means fully mastered"),
  strengths: z.array(z.string()),
  mistakes: z.array(z.string()).describe("Specific errors seen in the work, each with what the correct approach is"),
  mastery: z.array(z.object({ topic: z.string(), score: z.number().int().min(1).max(5) })).describe("Per-topic mastery, 1 to 5"),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const ExpenseSchema = z.object({
  vendor: z.string(),
  description: z.string().describe("Short description of what was bought"),
  amount: z.number().describe("Total paid, in dollars"),
  date: z.string().describe("YYYY-MM-DD"),
  category: z.string().describe("The best matching category name from the list given"),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().describe("Anything the tutor should double-check, or empty"),
});
export type ExpenseDraft = z.infer<typeof ExpenseSchema>;

// ---------------------------------------------------------------- parent report

export async function draftParentReport(db: PrismaClient, studentId: string, opts: { from: Date; to: Date; createdById?: string | null }) {
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      organization: true,
      account: { include: { guardians: { where: { isPrimary: true }, take: 1 } } },
      lessons: { where: { lesson: { startsAt: { gte: opts.from, lte: opts.to }, deletedAt: null } }, include: { lesson: true }, orderBy: { lesson: { startsAt: "asc" } } },
      progressNotes: { where: { notedOn: { gte: opts.from, lte: opts.to } }, orderBy: { notedOn: "asc" } },
      sessionNotes: { where: { notedOn: { gte: opts.from, lte: opts.to } }, include: { lesson: { select: { startsAt: true, subject: true } } }, orderBy: { notedOn: "asc" } },
      assignments: { where: { createdAt: { gte: opts.from } }, include: { submissions: { include: { feedback: true } } }, orderBy: { createdAt: "asc" } },
      masteries: { orderBy: { notedAt: "desc" } },
    },
  });
  if (!student) throw new AiError("Student not found");
  const tz = student.organization.timezone;
  const parent = student.account.guardians[0]?.name ?? "Parent";
  const lessons = student.lessons.filter((s) => s.lesson.status !== "CANCELLED");
  const lines = [
    `Student: ${student.firstName} ${student.lastName}${student.grade ? `, grade ${student.grade}` : ""}${student.defaultSubject ? `, ${student.defaultSubject}` : ""}`,
    `Parent: ${parent}`,
    `Tutor / business: ${student.organization.name}`,
    `Period: ${dateOnlyStr(opts.from)} to ${dateOnlyStr(opts.to)}`,
    "",
    `Lessons in the period (${lessons.length}):`,
    ...lessons.map((s) => `- ${localDateStr(s.lesson.startsAt, tz)} ${localTimeStr(s.lesson.startsAt, tz)}, ${s.lesson.durationMin} min, ${s.lesson.subject}${s.academicNotes ? `. Notes: ${s.academicNotes}` : ""}${s.lesson.notes ? `. ${s.lesson.notes}` : ""}`),
    "",
    `Session notes (${student.sessionNotes.length}):`,
    ...student.sessionNotes.map((n) => `- ${dateOnlyStr(n.notedOn)} ${n.lesson ? n.lesson.subject : "general note"}: covered ${n.covered}${n.win ? `. Win: ${n.win}` : ""}${n.struggle ? `. Struggle: ${n.struggle}` : ""}${n.homework ? `. Homework: ${n.homework}` : ""}${n.engagement ? `. Engagement ${n.engagement}/5` : ""}${n.nextGoal ? `. Next: ${n.nextGoal}` : ""}`),
    ...(student.progressNotes.length ? ["", `Older progress notes (${student.progressNotes.length}):`, ...student.progressNotes.map((n) => `- ${dateOnlyStr(n.notedOn)}: ${n.note}`)] : []),
    "",
    `Homework (${student.assignments.length}):`,
    ...student.assignments.map((a) => `- ${a.title}: ${a.status.toLowerCase()}${a.submissions.length ? `, ${a.submissions.length} submitted` : ""}${a.submissions.some((s) => s.feedback?.comment) ? `. Feedback: ${a.submissions.map((s) => s.feedback?.comment).filter(Boolean).join(" ")}` : ""}`),
    "",
    student.masteries.length ? `Mastery (1 to 5): ${student.masteries.map((m) => `${m.topic} ${m.score}`).join(", ")}` : "",
  ].filter((l) => l !== "");

  const system = [
    "You write progress updates that a private tutor sends to a student's parent.",
    "Write in the first person as the tutor. Plain, warm, specific. Short paragraphs. No headings, no markdown.",
    "Only say things supported by the notes. Never invent scores, topics, or events. If the notes are thin, keep the update short and honest.",
    "Do not mention money, balances, or payments. Do not mention that this was drafted by software.",
    "Address the parent by first name. Sign off with the tutor's business name.",
  ].join(" ");

  const result = await generateStructured({ system, parts: [{ text: lines.join("\n") }], schema: ParentReportSchema, effort: "medium" });
  return db.draft.create({
    data: {
      organizationId: student.organizationId,
      kind: "PARENT_REPORT",
      subjectType: "student",
      subjectId: student.id,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      content: { ...result.data, from: dateOnlyStr(opts.from), to: dateOnlyStr(opts.to), to_name: parent, to_email: student.account.guardians[0]?.email ?? null },
      createdById: opts.createdById ?? null,
    },
  });
}

// ---------------------------------------------------------------- homework feedback

export async function draftFeedback(db: PrismaClient, submissionId: string, createdById?: string | null) {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      file: true,
      assignment: { include: { student: { include: { organization: true } }, files: { include: { file: true } } } },
    },
  });
  if (!sub) throw new AiError("Submission not found");
  const a = sub.assignment;
  const parts = [];
  parts.push({ text: `Assignment: ${a.title}${a.description ? `\n${a.description}` : ""}\nStudent: ${a.student.firstName}${a.student.grade ? `, grade ${a.student.grade}` : ""}${a.student.defaultSubject ? `, ${a.student.defaultSubject}` : ""}` });
  for (const af of a.files) {
    const p = fileToPart(af.file);
    if (p) parts.push({ text: `Assignment file: ${af.file.name}` }, p);
  }
  const work = sub.file ? fileToPart(sub.file) : null;
  if (work) parts.push({ text: `The student's submitted work: ${sub.file!.name}` }, work);
  else if (sub.note) parts.push({ text: `The student's submission (text): ${sub.note}` });
  else throw new AiError("This submission has no readable file. Supported: PDF, JPEG, PNG, WebP, text.");
  if (sub.note && work) parts.push({ text: `Student's note: ${sub.note}` });

  const system = [
    "You are an experienced private tutor reviewing a student's homework.",
    "Compare the work against the assignment. Be specific: point to the exact problems, say what was right, what was wrong, and what the correct approach is.",
    "The comment is for the student: warm, direct, no filler, no headings. Two to five short paragraphs.",
    "Score 1 to 5 for overall mastery of this assignment. Mastery topics should be the two to four concepts the assignment actually exercised, named plainly.",
  ].join(" ");

  const result = await generateStructured({ system, parts, schema: FeedbackSchema, effort: "high" });
  return db.draft.create({
    data: {
      organizationId: a.organizationId,
      kind: "FEEDBACK",
      subjectType: "submission",
      subjectId: sub.id,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      content: result.data,
      createdById: createdById ?? null,
    },
  });
}

/** Approve a feedback draft: write Feedback and Mastery rows, mark the assignment reviewed. */
export async function approveFeedback(db: PrismaClient, draftId: string, edits: Partial<Pick<Feedback, "comment" | "score">> = {}, reviewedById?: string | null) {
  const draft = await db.draft.findUnique({ where: { id: draftId } });
  if (!draft || draft.kind !== "FEEDBACK") throw new AiError("Draft not found");
  const data = FeedbackSchema.parse({ ...(draft.content as object), ...edits });
  const sub = await db.submission.findUniqueOrThrow({ where: { id: draft.subjectId }, include: { assignment: true } });
  await db.$transaction(async (tx) => {
    await tx.feedback.upsert({
      where: { submissionId: sub.id },
      update: { comment: data.comment, score: data.score, reviewedById: reviewedById ?? null, draftId: draft.id, reviewedAt: new Date() },
      create: { submissionId: sub.id, comment: data.comment, score: data.score, reviewedById: reviewedById ?? null, draftId: draft.id },
    });
    for (const m of data.mastery) {
      await tx.mastery.upsert({
        where: { studentId_topic: { studentId: sub.assignment.studentId, topic: m.topic } },
        update: { score: m.score, notedById: reviewedById ?? null, notedAt: new Date() },
        create: { studentId: sub.assignment.studentId, topic: m.topic, score: m.score, notedById: reviewedById ?? null },
      });
    }
    await tx.assignment.update({ where: { id: sub.assignmentId }, data: { status: "REVIEWED" } });
    await tx.draft.update({ where: { id: draft.id }, data: { status: "APPROVED", approvedAt: new Date(), content: data } });
  });
}

// ---------------------------------------------------------------- expense from receipt

export async function draftExpenseFromReceipt(db: PrismaClient, fileId: string, createdById?: string | null) {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) throw new AiError("File not found");
  const part = fileToPart(file);
  if (!part || "text" in part) throw new AiError("Upload a photo or PDF of the receipt.");
  const categories = await db.expenseCategory.findMany({
    where: { OR: [{ organizationId: null }, { organizationId: file.organizationId }], archivedAt: null },
    orderBy: { name: "asc" },
  });
  const system = [
    "You read receipts and invoices for a small tutoring business and turn them into an expense entry.",
    "Read the total actually paid (after tax and tip), the date on the receipt, and the vendor's name as printed.",
    `Pick the category from this list only: ${categories.map((c) => c.name).join("; ")}.`,
    "If the total or the date is unclear, say so in notes and set confidence to low.",
  ].join(" ");
  const result = await generateStructured({ system, parts: [{ text: "Receipt:" }, part], schema: ExpenseSchema, effort: "low" });
  const cat = categories.find((c) => c.name.toLowerCase() === result.data.category.toLowerCase());
  return db.draft.create({
    data: {
      organizationId: file.organizationId,
      kind: "EXPENSE_FROM_RECEIPT",
      subjectType: "file",
      subjectId: file.id,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      content: { ...result.data, categoryId: cat?.id ?? null },
      createdById: createdById ?? null,
    },
  });
}

export async function discardDraft(db: PrismaClient, draftId: string) {
  await db.draft.update({ where: { id: draftId }, data: { status: "DISCARDED" } });
}

export async function markApproved(db: PrismaClient, draftId: string, content?: object) {
  await db.draft.update({ where: { id: draftId }, data: { status: "APPROVED", approvedAt: new Date(), ...(content ? { content } : {}) } });
}
