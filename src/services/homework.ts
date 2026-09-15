/**
 * Homework: assignments with library attachments, a public upload link per
 * assignment, submissions, and feedback.
 *
 * Status flow: PENDING (made, link not sent) -> ASSIGNED (student told) ->
 * SOLVED (something submitted) -> REVIEWED (feedback given). OVERDUE is
 * computed from dueOn, never stored, so nothing has to run at midnight.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { dateOnlyFromStr } from "../lib/tz";
import { storeFile } from "./files";

export class HomeworkError extends Error {}

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

export type EffectiveStatus = "PENDING" | "ASSIGNED" | "SOLVED" | "REVIEWED" | "OVERDUE";

export function effectiveStatus(a: { status: string; dueOn: Date | null }, today: Date): EffectiveStatus {
  if (a.status === "REVIEWED" || a.status === "SOLVED") return a.status;
  if (a.dueOn && a.dueOn < today) return "OVERDUE";
  return a.status as EffectiveStatus;
}

export interface AssignmentInput {
  studentId: string;
  title: string;
  description?: string | null;
  dueOn?: string | null;
  lessonId?: string | null;
  fileIds?: string[];
}

/** Create an assignment with its public upload token. Returns the assignment and the raw upload URL path. */
export async function createAssignment(db: PrismaClient, organizationId: string, input: AssignmentInput, createdById?: string | null) {
  if (!input.title.trim()) throw new HomeworkError("Title is required");
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new HomeworkError("Due date is not valid");
  const student = await db.student.findFirst({ where: { id: input.studentId, organizationId, deletedAt: null } });
  if (!student) throw new HomeworkError("Student not found");
  const fileIds = [...new Set(input.fileIds ?? [])];
  if (fileIds.length) {
    const n = await db.file.count({ where: { id: { in: fileIds }, organizationId } });
    if (n !== fileIds.length) throw new HomeworkError("One of the files does not belong to this organization");
  }
  const raw = randomBytes(24).toString("base64url");
  const assignment = await db.$transaction(async (tx) => {
    const a = await tx.assignment.create({
      data: {
        organizationId, studentId: student.id, lessonId: input.lessonId ?? null, title: input.title.trim(), description: input.description?.trim() || null,
        dueOn: input.dueOn ? dateOnlyFromStr(input.dueOn) : null, status: "PENDING", createdById: createdById ?? null,
        files: { create: fileIds.map((fileId) => ({ fileId })) },
      },
    });
    await tx.token.create({ data: { organizationId, kind: "HOMEWORK_UPLOAD", tokenHash: hashToken(raw), subjectId: a.id } });
    return a;
  });
  return { assignment, uploadPath: `/h/${raw}` };
}

/** A fresh upload link (old one stops working). */
export async function regenerateUploadLink(db: PrismaClient, organizationId: string, assignmentId: string): Promise<string> {
  const a = await db.assignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!a) throw new HomeworkError("Assignment not found");
  const raw = randomBytes(24).toString("base64url");
  await db.$transaction([
    db.token.updateMany({ where: { kind: "HOMEWORK_UPLOAD", subjectId: assignmentId, revokedAt: null }, data: { revokedAt: new Date() } }),
    db.token.create({ data: { organizationId, kind: "HOMEWORK_UPLOAD", tokenHash: hashToken(raw), subjectId: assignmentId } }),
  ]);
  return `/h/${raw}`;
}

export async function markAssigned(db: PrismaClient, organizationId: string, assignmentId: string) {
  const a = await db.assignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!a) throw new HomeworkError("Assignment not found");
  if (a.status === "PENDING") await db.assignment.update({ where: { id: assignmentId }, data: { status: "ASSIGNED", inviteSentAt: new Date() } });
}

export async function updateAssignment(db: PrismaClient, organizationId: string, assignmentId: string, patch: { title?: string; description?: string | null; dueOn?: string | null }) {
  const a = await db.assignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!a) throw new HomeworkError("Assignment not found");
  if (patch.title !== undefined && !patch.title.trim()) throw new HomeworkError("Title is required");
  if (patch.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueOn)) throw new HomeworkError("Due date is not valid");
  await db.assignment.update({
    where: { id: assignmentId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn ? dateOnlyFromStr(patch.dueOn) : null } : {}),
    },
  });
}

export async function deleteAssignment(db: PrismaClient, organizationId: string, assignmentId: string) {
  const a = await db.assignment.findFirst({ where: { id: assignmentId, organizationId }, include: { _count: { select: { submissions: true } } } });
  if (!a) throw new HomeworkError("Assignment not found");
  if (a._count.submissions > 0) throw new HomeworkError("This assignment has submissions and cannot be deleted");
  await db.$transaction([
    db.token.updateMany({ where: { kind: "HOMEWORK_UPLOAD", subjectId: assignmentId, revokedAt: null }, data: { revokedAt: new Date() } }),
    db.assignment.delete({ where: { id: assignmentId } }),
  ]);
}

// ---------------------------------------------------------------- public side

export async function assignmentByToken(db: PrismaClient, raw: string) {
  const t = await db.token.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!t || t.kind !== "HOMEWORK_UPLOAD" || t.revokedAt) return null;
  return db.assignment.findUnique({
    where: { id: t.subjectId },
    include: {
      student: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true, timezone: true } },
      files: { include: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true } } } },
      submissions: { orderBy: { submittedAt: "desc" }, include: { file: { select: { id: true, name: true, sizeBytes: true } }, feedback: true } },
    },
  });
}

export const SUBMISSION_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);

/** A student uploads work through the public link. */
export async function submitWork(db: PrismaClient, raw: string, files: { name: string; mimeType: string; data: Uint8Array }[], note?: string | null) {
  const a = await assignmentByToken(db, raw);
  if (!a) throw new HomeworkError("This link is not valid any more");
  if (a.status === "REVIEWED") throw new HomeworkError("This assignment has already been reviewed");
  if (files.length === 0 && !note?.trim()) throw new HomeworkError("Add a file or a note");
  if (files.length > 10) throw new HomeworkError("Up to 10 files at a time");
  for (const f of files) if (!SUBMISSION_TYPES.has(f.mimeType)) throw new HomeworkError(`${f.name}: only PDF and photos are accepted`);
  const stored: { id: string }[] = [];
  for (const f of files) stored.push(await storeFile(db, { organizationId: a.organizationId, name: f.name, mimeType: f.mimeType, data: f.data }));
  await db.$transaction(async (tx) => {
    if (stored.length === 0) {
      await tx.submission.create({ data: { assignmentId: a.id, note: note?.trim() || null, source: "STUDENT" } });
    }
    for (const [i, file] of stored.entries()) {
      await tx.submission.create({ data: { assignmentId: a.id, fileId: file.id, note: i === 0 ? note?.trim() || null : null, source: "STUDENT" } });
    }
    await tx.assignment.update({ where: { id: a.id }, data: { status: "SOLVED" } });
  });
  return stored.length;
}

/** A file a student may download through the public link: an attachment of this assignment, or one of its submissions. */
export async function publicFile(db: PrismaClient, raw: string, fileId: string) {
  const a = await assignmentByToken(db, raw);
  if (!a) return null;
  const allowed = a.files.some((f) => f.file.id === fileId) || a.submissions.some((s) => s.file?.id === fileId);
  if (!allowed) return null;
  return db.file.findUnique({ where: { id: fileId } });
}

// ---------------------------------------------------------------- tutor side

export async function giveFeedback(db: PrismaClient, organizationId: string, submissionId: string, input: { comment: string; score?: number | null }, reviewedById?: string | null) {
  const sub = await db.submission.findFirst({ where: { id: submissionId, assignment: { organizationId } }, include: { assignment: true } });
  if (!sub) throw new HomeworkError("Submission not found");
  if (!input.comment.trim()) throw new HomeworkError("Write a comment");
  if (input.score != null && (!Number.isInteger(input.score) || input.score < 1 || input.score > 5)) throw new HomeworkError("Score is 1 to 5");
  await db.$transaction([
    db.feedback.upsert({
      where: { submissionId },
      update: { comment: input.comment.trim(), score: input.score ?? null, reviewedById: reviewedById ?? null, reviewedAt: new Date() },
      create: { submissionId, comment: input.comment.trim(), score: input.score ?? null, reviewedById: reviewedById ?? null },
    }),
    db.assignment.update({ where: { id: sub.assignmentId }, data: { status: "REVIEWED" } }),
  ]);
}

export interface AssignmentRow {
  id: string;
  title: string;
  studentId: string;
  studentName: string;
  dueOn: Date | null;
  status: EffectiveStatus;
  submissions: number;
  createdAt: Date;
}

export async function listAssignments(db: PrismaClient, organizationId: string, opts: { status?: EffectiveStatus | "OPEN"; studentId?: string; today: Date; archived?: boolean }): Promise<AssignmentRow[]> {
  const rows = await db.assignment.findMany({
    where: { organizationId, archivedAt: opts.archived ? { not: null } : null, ...(opts.studentId ? { studentId: opts.studentId } : {}) },
    include: { student: { select: { firstName: true, lastName: true } }, _count: { select: { submissions: true } } },
    orderBy: [{ createdAt: "desc" }], // newest first
  });
  const out = rows.map((a) => ({
    id: a.id, title: a.title, studentId: a.studentId, studentName: `${a.student.firstName} ${a.student.lastName}`, dueOn: a.dueOn,
    status: effectiveStatus(a, opts.today), submissions: a._count.submissions, createdAt: a.createdAt,
  }));
  if (!opts.status) return out;
  if (opts.status === "OPEN") return out.filter((r) => r.status !== "REVIEWED");
  return out.filter((r) => r.status === opts.status);
}

export async function assignmentDetail(db: PrismaClient, organizationId: string, assignmentId: string) {
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, organizationId },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, email: true, account: { select: { guardians: { where: { isPrimary: true }, take: 1 } } } } },
      files: { include: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true } } } },
      submissions: { orderBy: { submittedAt: "asc" }, include: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true } }, feedback: true } },
      lesson: { select: { id: true, startsAt: true, subject: true } },
    },
  });
  if (!a) return null;
  const drafts = await db.draft.findMany({ where: { kind: "FEEDBACK", subjectId: { in: a.submissions.map((s) => s.id) }, status: "DRAFT" }, orderBy: { createdAt: "desc" } });
  const activeToken = await db.token.findFirst({ where: { kind: "HOMEWORK_UPLOAD", subjectId: a.id, revokedAt: null } });
  return { assignment: a, drafts, hasLink: !!activeToken };
}

/** Hide assignments from the open lists. Returns how many changed. */
export async function archiveAssignments(db: PrismaClient, organizationId: string, ids: string[], now = new Date()) {
  const r = await db.assignment.updateMany({ where: { organizationId, id: { in: ids }, archivedAt: null }, data: { archivedAt: now } });
  return r.count;
}

export async function unarchiveAssignment(db: PrismaClient, organizationId: string, id: string) {
  const r = await db.assignment.updateMany({ where: { organizationId, id }, data: { archivedAt: null } });
  if (r.count === 0) throw new HomeworkError("Assignment not found");
}

/**
 * Archive old work in one go: everything due before the date (or, with no due
 * date, made before it). Work a student sent that you have not reviewed stays
 * out, so nothing waiting for you disappears.
 */
export async function archiveOlderThan(db: PrismaClient, organizationId: string, before: Date, now = new Date()) {
  const r = await db.assignment.updateMany({
    where: {
      organizationId,
      archivedAt: null,
      status: { not: "SOLVED" },
      OR: [{ dueOn: { lt: before } }, { dueOn: null, createdAt: { lt: before } }],
    },
    data: { archivedAt: now },
  });
  return r.count;
}
