/**
 * Runs against the local resolventum_v2 database after `npm run import`.
 * The model is replaced with a fake that records what it was asked and
 * returns fixed answers, so no key is needed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { approveFeedback, draftExpenseFromReceipt, draftFeedback, draftParentReport, discardDraft } from "./drafts";
import { AiNotConfiguredError, type GenerateRequest, generateStructured, setGenerator } from "./generate";

let studentId: string;
let orgId: string;
const asked: GenerateRequest<unknown>[] = [];
const made = { drafts: [] as string[], files: [] as string[] };

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  studentId = s.id;
  orgId = s.organizationId;
});
afterEach(async () => {
  setGenerator(null);
  asked.length = 0;
  await prisma.draft.deleteMany({ where: { id: { in: made.drafts.splice(0) } } });
  await prisma.file.deleteMany({ where: { id: { in: made.files.splice(0) } } });
});
afterAll(async () => {
  await prisma.feedback.deleteMany({ where: { draftId: { not: null } } });
});

function fake(answer: unknown) {
  setGenerator(async (req) => {
    asked.push(req as GenerateRequest<unknown>);
    return { data: answer as never, model: "fake-model", inputTokens: 100, outputTokens: 50 };
  });
}

describe("ai drafts", () => {
  it("refuses cleanly when no key is configured", async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    await expect(generateStructured({ system: "x", parts: [{ text: "y" }], schema: (await import("zod")).z.object({}) })).rejects.toThrow(AiNotConfiguredError);
    if (saved) process.env.GEMINI_API_KEY = saved;
  });

  it("drafts a parent report from the student's real notes and stores it", async () => {
    fake({ subject: "Estella's progress", body: "Hi Christine, ...", highlights: ["a", "b", "c"], next_focus: "Data analysis" });
    const d = await draftParentReport(prisma, studentId, { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-06-30T00:00:00Z") });
    made.drafts.push(d.id);
    expect(d.kind).toBe("PARENT_REPORT");
    expect(d.status).toBe("DRAFT");
    expect(d.model).toBe("fake-model");
    expect(d.inputTokens).toBe(100);
    const content = d.content as Record<string, unknown>;
    expect(content.subject).toBe("Estella's progress");
    expect(content.to_name).toBe("Christine Urman");
    // The prompt carried her actual lessons and the tutor's business name, and nothing about money.
    const prompt = (asked[0].parts[0] as { text: string }).text;
    expect(prompt).toContain("Student: Estella Urman");
    expect(prompt).toContain("Easy STEM School");
    expect(prompt).toMatch(/Lessons in the period \(\d+\)/);
    expect(prompt).not.toMatch(/\$\d/);
    expect(asked[0].system).toContain("Do not mention money");
  });

  it("drafts feedback from a submitted PDF and approving it writes feedback, mastery, and status", async () => {
    const sub = await prisma.submission.findFirstOrThrow({ where: { file: { mimeType: "application/pdf" } }, include: { assignment: true } });
    fake({ comment: "Nice work on the first page.", score: 4, strengths: ["setup"], mistakes: ["sign error in Q3: the correct approach is ..."], mastery: [{ topic: "Linear equations", score: 4 }] });
    const d = await draftFeedback(prisma, sub.id);
    made.drafts.push(d.id);
    expect(d.kind).toBe("FEEDBACK");
    const pdfParts = asked[0].parts.filter((p) => "inlineData" in p && p.inlineData?.mimeType === "application/pdf");
    expect(pdfParts.length).toBeGreaterThanOrEqual(1);

    const before = await prisma.assignment.findUniqueOrThrow({ where: { id: sub.assignmentId } });
    await approveFeedback(prisma, d.id, { score: 5 });
    const fb = await prisma.feedback.findUniqueOrThrow({ where: { submissionId: sub.id } });
    expect(fb.comment).toBe("Nice work on the first page.");
    expect(fb.score).toBe(5);
    expect(fb.draftId).toBe(d.id);
    const m = await prisma.mastery.findUniqueOrThrow({ where: { studentId_topic: { studentId: sub.assignment.studentId, topic: "Linear equations" } } });
    expect(m.score).toBe(4);
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: sub.assignmentId } })).status).toBe("REVIEWED");
    expect((await prisma.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("APPROVED");
    // put the fixture back
    await prisma.feedback.delete({ where: { submissionId: sub.id } });
    await prisma.mastery.delete({ where: { id: m.id } });
    await prisma.assignment.update({ where: { id: sub.assignmentId }, data: { status: before.status } });
  });

  it("drafts an expense from a receipt image and maps the category", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const file = await prisma.file.create({ data: { organizationId: orgId, name: "receipt.png", mimeType: "image/png", sizeBytes: png.length, sha256: "test-" + Date.now(), data: png } });
    made.files.push(file.id);
    fake({ vendor: "Staples", description: "Whiteboard markers", amount: 18.49, date: "2026-09-10", category: "Supplies", confidence: "high", notes: "" });
    const d = await draftExpenseFromReceipt(prisma, file.id);
    made.drafts.push(d.id);
    const content = d.content as Record<string, unknown>;
    expect(content.vendor).toBe("Staples");
    expect(typeof content.categoryId).toBe("string");
    expect(asked[0].system).toContain("Supplies");
    await discardDraft(prisma, d.id);
    expect((await prisma.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("DISCARDED");
  });
});
