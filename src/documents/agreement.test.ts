import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { AgreementError, agreementPdf, fillAgreement } from "./agreement";

describe("tutoring agreement", () => {
  it("fills known fields and leaves unknown ones visible", () => {
    expect(fillAgreement("{{STUDENT_NAME}} pays {{LESSON_PRICE}} {{NOPE}}", { STUDENT_NAME: "Ava", LESSON_PRICE: "$130.00" })).toBe("Ava pays $130.00 {{NOPE}}");
  });

  it("makes a PDF for a real student and refuses one from another school", async () => {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const st = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Victoria" } });
    const d = await agreementPdf(prisma, org.id, st.id, new Date("2026-09-14T00:00:00Z"));
    expect(d.filename).toBe("Tutoring agreement - Victoria Li.pdf");
    expect((await PDFDocument.load(d.bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    await expect(agreementPdf(prisma, "other-org", st.id, new Date())).rejects.toThrow(AgreementError);
  });
});
