/**
 * Stored files: the tutor's library, homework attachments, student
 * submissions, receipts. Bytes live in Postgres today; `storage` and
 * `storageKey` are there so a move to object storage is a backfill.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";

export class FileError extends Error {}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain", "text/csv", "text/rtf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Store bytes as a File. The same bytes under the same name in the same organization are reused. */
export async function storeFile(db: PrismaClient, input: { organizationId: string; name: string; mimeType: string; data: Uint8Array; uploadedById?: string | null }) {
  const name = input.name.trim().replace(/[\\/]/g, "_").slice(0, 200) || "file";
  if (input.data.length === 0) throw new FileError(`${name} is empty`);
  if (input.data.length > MAX_FILE_BYTES) throw new FileError(`${name} is larger than 25 MB`);
  const mimeType = input.mimeType || "application/octet-stream";
  if (!ALLOWED_UPLOAD_TYPES.has(mimeType)) throw new FileError(`${name}: ${mimeType} files are not accepted`);
  const hash = sha256(input.data);
  const existing = await db.file.findUnique({ where: { organizationId_sha256_name: { organizationId: input.organizationId, sha256: hash, name } } });
  if (existing) return existing;
  return db.file.create({
    data: { organizationId: input.organizationId, name, mimeType, sizeBytes: input.data.length, sha256: hash, storage: "DATABASE", data: new Uint8Array(input.data), uploadedById: input.uploadedById ?? null },
  });
}

export async function addToLibrary(db: PrismaClient, fileId: string, folder?: string | null) {
  return db.libraryItem.upsert({ where: { fileId }, update: { folder: folder ?? undefined }, create: { fileId, folder: folder ?? null } });
}

export interface LibraryRow {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  folder: string | null;
  createdAt: Date;
  usedInAssignments: number;
}

export async function listLibrary(db: PrismaClient, organizationId: string): Promise<LibraryRow[]> {
  const rows = await db.libraryItem.findMany({
    where: { file: { organizationId } },
    include: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, _count: { select: { assignmentFiles: true } } } } },
    orderBy: { file: { name: "asc" } },
  });
  return rows.map((r) => ({
    fileId: r.file.id, name: r.file.name, mimeType: r.file.mimeType, sizeBytes: r.file.sizeBytes, folder: r.folder, createdAt: r.file.createdAt,
    usedInAssignments: r.file._count.assignmentFiles,
  }));
}

/** Remove from the library. The File row stays if any assignment still points at it. */
export async function removeFromLibrary(db: PrismaClient, fileId: string) {
  await db.libraryItem.deleteMany({ where: { fileId } });
  const uses = await db.file.findUnique({ where: { id: fileId }, select: { _count: { select: { assignmentFiles: true, submissions: true, lessonFiles: true, expenseReceipts: true } } } });
  if (uses && Object.values(uses._count).every((n) => n === 0)) await db.file.delete({ where: { id: fileId } });
}

/** Bytes for download, scoped to an organization. */
export async function fileForDownload(db: PrismaClient, organizationId: string, fileId: string) {
  const f = await db.file.findFirst({ where: { id: fileId, organizationId } });
  if (!f || !f.data) return null;
  return f;
}
