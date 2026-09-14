/** Runs against the local resolventum_v2 database after `npm run import`. Cleans up what it makes. */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { HomeworkError, assignmentByToken, assignmentDetail, createAssignment, deleteAssignment, effectiveStatus, giveFeedback, listAssignments, markAssigned, publicFile, regenerateUploadLink, submitWork } from "./homework";
import { listLibrary, removeFromLibrary, storeFile, addToLibrary } from "./files";

let orgId: string;
let studentId: string;
const made: string[] = [];
const files: string[] = [];

beforeAll(async () => {
  const s = await prisma.student.findFirstOrThrow({ where: { firstName: "Estella", lastName: "Urman" } });
  orgId = s.organizationId;
  studentId = s.id;
});
afterEach(async () => {
  for (const id of made.splice(0)) {
    await prisma.token.deleteMany({ where: { subjectId: id } });
    await prisma.submission.deleteMany({ where: { assignmentId: id } });
    await prisma.assignment.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.file.deleteMany({ where: { id: { in: files.splice(0) } } });
});

const pdf = () => Buffer.from("%PDF-1.4\n%test " + Date.now());

describe("homework", () => {
  it("computes overdue without storing it", () => {
    const today = new Date("2026-09-12T00:00:00Z");
    expect(effectiveStatus({ status: "ASSIGNED", dueOn: new Date("2026-09-01T00:00:00Z") }, today)).toBe("OVERDUE");
    expect(effectiveStatus({ status: "ASSIGNED", dueOn: new Date("2026-09-20T00:00:00Z") }, today)).toBe("ASSIGNED");
    expect(effectiveStatus({ status: "SOLVED", dueOn: new Date("2026-09-01T00:00:00Z") }, today)).toBe("SOLVED");
    expect(effectiveStatus({ status: "PENDING", dueOn: null }, today)).toBe("PENDING");
  });

  it("creates an assignment with a library file and a working public link, takes a submission, gives feedback", async () => {
    const lib = await storeFile(prisma, { organizationId: orgId, name: "worksheet.pdf", mimeType: "application/pdf", data: pdf() });
    files.push(lib.id);
    await addToLibrary(prisma, lib.id, "Algebra");
    expect((await listLibrary(prisma, orgId)).some((r) => r.fileId === lib.id && r.folder === "Algebra")).toBe(true);

    const { assignment, uploadPath } = await createAssignment(prisma, orgId, { studentId, title: "Worksheet 3", dueOn: "2027-01-15", fileIds: [lib.id] });
    made.push(assignment.id);
    expect(assignment.status).toBe("PENDING");
    expect(uploadPath).toMatch(/^\/h\/[A-Za-z0-9_-]+$/);
    const raw = uploadPath.slice(3);

    const pub = await assignmentByToken(prisma, raw);
    expect(pub?.title).toBe("Worksheet 3");
    expect(pub?.files.map((f) => f.file.name)).toEqual(["worksheet.pdf"]);
    expect((await publicFile(prisma, raw, lib.id))?.name).toBe("worksheet.pdf");
    expect(await publicFile(prisma, raw, "not-a-file")).toBeNull();

    await markAssigned(prisma, orgId, assignment.id);
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("ASSIGNED");

    const n = await submitWork(prisma, raw, [{ name: "answers.pdf", mimeType: "application/pdf", data: pdf() }], "Here it is");
    expect(n).toBe(1);
    const detail = await assignmentDetail(prisma, orgId, assignment.id);
    expect(detail?.assignment.status).toBe("SOLVED");
    expect(detail?.assignment.submissions[0].note).toBe("Here it is");
    files.push(detail!.assignment.submissions[0].file!.id);

    await giveFeedback(prisma, orgId, detail!.assignment.submissions[0].id, { comment: "Good", score: 4 });
    expect((await assignmentDetail(prisma, orgId, assignment.id))?.assignment.status).toBe("REVIEWED");
    await expect(submitWork(prisma, raw, [{ name: "x.pdf", mimeType: "application/pdf", data: pdf() }])).rejects.toThrow(/already been reviewed/);

    const rows = await listAssignments(prisma, orgId, { today: new Date(), studentId });
    expect(rows.find((r) => r.id === assignment.id)?.status).toBe("REVIEWED");
    await expect(deleteAssignment(prisma, orgId, assignment.id)).rejects.toThrow(/submissions/);
  });

  it("a regenerated link kills the old one", async () => {
    const { assignment, uploadPath } = await createAssignment(prisma, orgId, { studentId, title: "Link test" });
    made.push(assignment.id);
    const fresh = await regenerateUploadLink(prisma, orgId, assignment.id);
    expect(await assignmentByToken(prisma, uploadPath.slice(3))).toBeNull();
    expect((await assignmentByToken(prisma, fresh.slice(3)))?.id).toBe(assignment.id);
    await deleteAssignment(prisma, orgId, assignment.id);
    made.pop();
    expect(await prisma.assignment.findUnique({ where: { id: assignment.id } })).toBeNull();
  });

  it("rejects bad input", async () => {
    await expect(createAssignment(prisma, orgId, { studentId, title: " " })).rejects.toThrow(HomeworkError);
    await expect(createAssignment(prisma, orgId, { studentId: "nope", title: "x" })).rejects.toThrow(/Student/);
    await expect(submitWork(prisma, "bad-token", [])).rejects.toThrow(/not valid/);
    const { assignment, uploadPath } = await createAssignment(prisma, orgId, { studentId, title: "Types" });
    made.push(assignment.id);
    await expect(submitWork(prisma, uploadPath.slice(3), [{ name: "a.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: pdf() }])).rejects.toThrow(/only PDF and photos/);
  });

  it("removing a library file keeps it when an assignment uses it", async () => {
    const lib = await storeFile(prisma, { organizationId: orgId, name: "keep.pdf", mimeType: "application/pdf", data: pdf() });
    files.push(lib.id);
    await addToLibrary(prisma, lib.id);
    const { assignment } = await createAssignment(prisma, orgId, { studentId, title: "Uses file", fileIds: [lib.id] });
    made.push(assignment.id);
    await removeFromLibrary(prisma, lib.id);
    expect(await prisma.file.findUnique({ where: { id: lib.id } })).not.toBeNull();
    expect(await prisma.libraryItem.findUnique({ where: { fileId: lib.id } })).toBeNull();
  });
});

describe("archiving homework", () => {
  it("archives picked and old work, keeps work waiting for review, and can undo", async () => {
    const { archiveAssignments, archiveOlderThan, listAssignments, unarchiveAssignment } = await import("./homework");
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const student = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Estella" } });
    const tag = `Archivetest${Date.now()}`;
    const mk = (title: string, dueOn: string | null, status: "ASSIGNED" | "SOLVED" = "ASSIGNED") =>
      prisma.assignment.create({ data: { organizationId: org.id, studentId: student.id, title: `${tag} ${title}`, dueOn: dueOn ? new Date(`${dueOn}T00:00:00Z`) : null, status } });
    const old = await mk("old", "2020-01-10");
    const waiting = await mk("waiting", "2020-01-10", "SOLVED");
    const fresh = await mk("fresh", "2099-01-10");
    const picked = await mk("picked", "2099-02-10");
    try {
      const today = new Date("2026-09-13T00:00:00Z");
      expect(await archiveOlderThan(prisma, org.id, new Date("2021-01-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
      expect(await archiveAssignments(prisma, org.id, [picked.id])).toBe(1);
      const open = (await listAssignments(prisma, org.id, { today, studentId: student.id })).map((r) => r.id);
      expect(open).toContain(waiting.id);
      expect(open).toContain(fresh.id);
      expect(open).not.toContain(old.id);
      expect(open).not.toContain(picked.id);
      const archived = (await listAssignments(prisma, org.id, { today, studentId: student.id, archived: true })).map((r) => r.id);
      expect(archived).toEqual(expect.arrayContaining([old.id, picked.id]));
      await unarchiveAssignment(prisma, org.id, picked.id);
      expect((await prisma.assignment.findUniqueOrThrow({ where: { id: picked.id } })).archivedAt).toBeNull();
    } finally {
      await prisma.assignment.deleteMany({ where: { title: { startsWith: tag } } });
    }
  });
});
