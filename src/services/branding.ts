/** The school logo: stored as a File, shown in the app and drawn on every PDF. PNG or JPEG so PDFs can embed it. */
import type { PrismaClient } from "../../generated/prisma/client";
import { FileError, storeFile } from "./files";

export const LOGO_TYPES = new Set(["image/png", "image/jpeg"]);
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export async function setLogo(db: PrismaClient, organizationId: string, file: { name: string; mimeType: string; data: Uint8Array }, uploadedById?: string | null) {
  if (!LOGO_TYPES.has(file.mimeType)) throw new FileError("The logo must be a PNG or JPEG image");
  if (file.data.length > LOGO_MAX_BYTES) throw new FileError("The logo must be smaller than 2 MB");
  const stored = await storeFile(db, { organizationId, name: `logo-${file.name}`, mimeType: file.mimeType, data: file.data, uploadedById });
  await db.organization.update({ where: { id: organizationId }, data: { logoFileId: stored.id } });
  return stored;
}

export async function removeLogo(db: PrismaClient, organizationId: string) {
  await db.organization.update({ where: { id: organizationId }, data: { logoFileId: null } });
}

export async function loadLogo(db: PrismaClient, organizationId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { logo: { select: { data: true, mimeType: true } } } });
  if (!org?.logo?.data) return null;
  return { bytes: new Uint8Array(org.logo.data), mime: org.logo.mimeType };
}
