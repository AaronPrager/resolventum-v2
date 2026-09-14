/**
 * The audit trail: who did what to money, credit, and lessons. Appended by
 * the server actions that make the change, read by the owner. Never edited.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export interface AuditInput {
  organizationId: string;
  actorId?: string | null;
  actorName?: string | null;
  /** "lesson.cancel", "payment.record", "charge.void", "student.status", ... */
  action: string;
  subjectType: "lesson" | "payment" | "charge" | "account" | "student" | "tutor" | "lead" | "note" | "settings";
  subjectId: string;
  summary: string;
}

/** Best effort: a failed audit write must never fail the change it describes. */
export async function recordAudit(db: PrismaClient, input: AuditInput) {
  try {
    await db.auditEvent.create({ data: { ...input, summary: input.summary.slice(0, 500) } });
  } catch (e) {
    console.error("audit write failed", e);
  }
}

export async function listAudit(db: PrismaClient, organizationId: string, opts: { take?: number; subjectType?: string; subjectId?: string } = {}) {
  return db.auditEvent.findMany({
    where: { organizationId, ...(opts.subjectType ? { subjectType: opts.subjectType } : {}), ...(opts.subjectId ? { subjectId: opts.subjectId } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
  });
}
