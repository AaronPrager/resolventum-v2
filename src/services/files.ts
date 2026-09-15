/**
 * Stored files: homework attachments, student submissions, receipts,
 * photos, the logo. Bytes live in Postgres today; `storage` and
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

export interface UsedFile { id: string; name: string; sizeBytes: number; uses: number; lastUsedAt: Date }

/** Files attached to any assignment so far, most recently used first. What "used before" offers when setting homework. */
export async function usedFiles(db: PrismaClient, organizationId: string, take = 200): Promise<UsedFile[]> {
  const rows = await db.file.findMany({
    where: { organizationId, assignmentFiles: { some: {} } },
    select: { id: true, name: true, sizeBytes: true, _count: { select: { assignmentFiles: true } }, assignmentFiles: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  return rows
    .map((f) => ({ id: f.id, name: f.name, sizeBytes: f.sizeBytes, uses: f._count.assignmentFiles, lastUsedAt: f.assignmentFiles[0]?.createdAt ?? new Date(0) }))
    .sort((x, y) => y.lastUsedAt.getTime() - x.lastUsedAt.getTime())
    .slice(0, take);
}

/** Bytes for download, scoped to an organization. */
export async function fileForDownload(db: PrismaClient, organizationId: string, fileId: string) {
  const f = await db.file.findFirst({ where: { id: fileId, organizationId } });
  if (!f || !f.data) return null;
  return f;
}
