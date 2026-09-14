/** Lesson categories: a per-school list. Uses a throwaway school. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { CategoryError, addLessonCategory, checkLessonCategory, deleteLessonCategory, listLessonCategories, renameLessonCategory, setLessonCategoryArchived } from "./lessonCategories";

let orgId: string;
beforeAll(async () => { orgId = (await prisma.organization.create({ data: { name: "Category Test School", slug: `cattest-${Date.now()}` } })).id; });
afterAll(async () => { await prisma.organization.delete({ where: { id: orgId } }); });

describe("lesson categories", () => {
  it("adds, refuses duplicates in any case, renames, archives, and deletes", async () => {
    const a = await addLessonCategory(prisma, orgId, "  Test   prep ");
    expect(a.name).toBe("Test prep");
    await expect(addLessonCategory(prisma, orgId, "test PREP")).rejects.toThrow(/already exists/);
    await expect(addLessonCategory(prisma, orgId, " ")).rejects.toThrow(CategoryError);
    const b = await addLessonCategory(prisma, orgId, "Enrichment");
    await expect(renameLessonCategory(prisma, orgId, b.id, "Test Prep")).rejects.toThrow(/already exists/);
    await renameLessonCategory(prisma, orgId, b.id, "Enrichment classes");
    expect((await listLessonCategories(prisma, orgId)).map((c) => c.name)).toEqual(["Enrichment classes", "Test prep"]);

    await setLessonCategoryArchived(prisma, orgId, b.id, true);
    expect((await listLessonCategories(prisma, orgId)).map((c) => c.name)).toEqual(["Test prep"]);
    expect((await listLessonCategories(prisma, orgId, { include: [b.id] })).map((c) => c.name)).toEqual(["Test prep", "Enrichment classes"]);
    await expect(addLessonCategory(prisma, orgId, "enrichment classes")).rejects.toThrow(/archived/);

    expect(await checkLessonCategory(prisma, orgId, a.id)).toBe(a.id);
    expect(await checkLessonCategory(prisma, orgId, null)).toBeNull();
    await expect(checkLessonCategory(prisma, "other-org", a.id)).rejects.toThrow(/not found/);

    await deleteLessonCategory(prisma, orgId, b.id);
    expect((await listLessonCategories(prisma, orgId, { includeArchived: true })).map((c) => c.name)).toEqual(["Test prep"]);
  });
});
