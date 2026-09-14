/** The logo: only PNG or JPEG, and drawn into statement PDFs. Uses a throwaway school. */
import { crc32, deflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { accountDocument } from "../documents/accountDocs";
import { loadLogo, removeLogo, setLogo } from "./branding";
import { FileError } from "./files";

/** A small solid PNG, made here so the test needs no fixture file. */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x4f)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const slug = `brandtest-${Date.now()}`;
let orgId: string;
let accountId: string;

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { name: "Brand Test School", slug } })).id;
  accountId = (await prisma.account.create({ data: { organizationId: orgId, name: "Test Family" } })).id;
});
afterAll(async () => {
  await prisma.organization.update({ where: { id: orgId }, data: { logoFileId: null } });
  await prisma.file.deleteMany({ where: { organizationId: orgId } });
  await prisma.account.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

async function imageCount(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const res = doc.getPage(0).node.Resources();
  const xo = res?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xo ? xo.keys().length : 0;
}

describe("logo", () => {
  it("refuses other image types and big files", async () => {
    await expect(setLogo(prisma, orgId, { name: "a.gif", mimeType: "image/gif", data: new Uint8Array([1]) })).rejects.toThrow(FileError);
    await expect(setLogo(prisma, orgId, { name: "a.png", mimeType: "image/png", data: new Uint8Array(3 * 1024 * 1024) })).rejects.toThrow(/2 MB/);
  });

  it("shows up in the statement PDF, and goes away when removed", async () => {
    const today = new Date("2026-09-13T00:00:00Z");
    expect(await imageCount((await accountDocument(prisma, orgId, accountId, { kind: "statement", today })).bytes)).toBe(0);
    await setLogo(prisma, orgId, { name: "logo.png", mimeType: "image/png", data: png(120, 40) });
    expect((await loadLogo(prisma, orgId))?.mime).toBe("image/png");
    expect(await imageCount((await accountDocument(prisma, orgId, accountId, { kind: "statement", today })).bytes)).toBe(1);
    await removeLogo(prisma, orgId);
    expect(await loadLogo(prisma, orgId)).toBeNull();
  });
});
