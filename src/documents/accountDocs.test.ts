/** PDFs and ZIPs from the imported data. Read-only. */
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { DocumentError, accountDocument, bulkDocuments, monthRange } from "./accountDocs";
import { invoiceNumber, pdfSafe } from "./accountPdf";

const today = new Date("2026-09-13T00:00:00Z");

describe("account documents", () => {
  it("makes a multi-page statement and a one-page invoice", async () => {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const a = await prisma.account.findFirstOrThrow({ where: { organizationId: org.id, name: "Victoria Li" } });
    const st = await accountDocument(prisma, org.id, a.id, { kind: "statement", from: "2026-01-01", to: "2026-09-13", today });
    expect(st.filename).toBe("Statement - Victoria Li - 2026-01-01 to 2026-09-13.pdf");
    expect(Buffer.from(st.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(st.bytes)).getPageCount()).toBeGreaterThan(1);

    const inv = await accountDocument(prisma, org.id, a.id, { kind: "invoice", month: "2026-08", today });
    expect(inv.filename).toBe("Invoice - Victoria Li - 2026-08.pdf");
    expect((await PDFDocument.load(inv.bytes)).getPageCount()).toBe(1);
    await expect(accountDocument(prisma, "other-org", a.id, { kind: "statement", today })).rejects.toThrow(DocumentError);
  });

  it("zips statements for every open balance", async () => {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const z = await bulkDocuments(prisma, org.id, { kind: "statement", today });
    const files = unzipSync(z.bytes);
    expect(Object.keys(files).length).toBe(z.count);
    expect(z.count).toBeGreaterThan(5);
    expect(Object.keys(files).every((f) => f.startsWith("Statement - ") && f.endsWith(".pdf"))).toBe(true);
  });

  it("helpers", () => {
    expect(monthRange("2026-02").to.toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(() => monthRange("2026-13")).toThrow(DocumentError);
    expect(invoiceNumber("97697d88-75d1-457c", "2026-08")).toBe("202608-97697");
    expect(pdfSafe("Coulomb’s law – ✓ 日本")).toBe("Coulomb’s law – ? ??");
  });
});

describe("emailing a statement", () => {
  it("sends to the address given, with the PDF attached, and logs it", async () => {
    const { setTransport } = await import("../email/send");
    const { emailAccountStatement } = await import("./emailStatement");
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const a = await prisma.account.findFirstOrThrow({ where: { organizationId: org.id, name: "Estella Urman" } });
    const sent: { to: string; subject: string; files: string[]; size: number }[] = [];
    setTransport(async (m) => {
      sent.push({ to: m.to, subject: m.subject, files: m.attachments?.map((x) => x.filename) ?? [], size: m.attachments?.[0]?.content.length ?? 0 });
      return { providerMessageId: "test" };
    });
    try {
      const id = await emailAccountStatement(prisma, org.id, a.id, { email: "parent@example.com", from: "2025-09-01", to: "2025-12-31", today });
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe("parent@example.com");
      expect(sent[0].files).toEqual(["Statement - Estella Urman - 2025-09-01 to 2025-12-31.pdf"]);
      expect(sent[0].size).toBeGreaterThan(1000);
      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("SENT");
      await prisma.message.delete({ where: { id } });
    } finally {
      setTransport(null);
    }
  });
});
