/**
 * Lesson categories: the school's own list of what a lesson is for. The
 * lesson form picks from it and the income report groups by it. Archiving
 * hides a category from the picker; deleting is only allowed while no lesson
 * uses it.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export class CategoryError extends Error {}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function listLessonCategories(db: PrismaClient, organizationId: string, opts: { includeArchived?: boolean; include?: string[] } = {}) {
  return db.lessonCategory.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { OR: [{ archivedAt: null }, { id: { in: opts.include ?? [] } }] }) },
    // Live ones first (archivedAt null), then by name.
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    include: { _count: { select: { lessons: true } } },
  });
}

export async function addLessonCategory(db: PrismaClient, organizationId: string, nameIn: string) {
  const name = clean(nameIn);
  if (!name) throw new CategoryError("Give the category a name");
  if (name.length > 60) throw new CategoryError("Keep the name under 60 characters");
  const dup = await db.lessonCategory.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" } } });
  if (dup) throw new CategoryError(dup.archivedAt ? `"${dup.name}" exists but is archived; restore it instead` : `"${dup.name}" already exists`);
  return db.lessonCategory.create({ data: { organizationId, name } });
}

export async function renameLessonCategory(db: PrismaClient, organizationId: string, id: string, nameIn: string) {
  const c = await db.lessonCategory.findFirst({ where: { id, organizationId } });
  if (!c) throw new CategoryError("Category not found");
  const name = clean(nameIn);
  if (!name) throw new CategoryError("Give the category a name");
  const dup = await db.lessonCategory.findFirst({ where: { organizationId, id: { not: id }, name: { equals: name, mode: "insensitive" } } });
  if (dup) throw new CategoryError(`"${dup.name}" already exists`);
  return db.lessonCategory.update({ where: { id }, data: { name } });
}

/** Archive hides it from the picker; lessons already in it keep it. Restore brings it back. */
export async function setLessonCategoryArchived(db: PrismaClient, organizationId: string, id: string, archived: boolean) {
  const c = await db.lessonCategory.findFirst({ where: { id, organizationId } });
  if (!c) throw new CategoryError("Category not found");
  return db.lessonCategory.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

export async function deleteLessonCategory(db: PrismaClient, organizationId: string, id: string) {
  const c = await db.lessonCategory.findFirst({ where: { id, organizationId }, include: { _count: { select: { lessons: true } } } });
  if (!c) throw new CategoryError("Category not found");
  if (c._count.lessons > 0) throw new CategoryError(`${c._count.lessons} lesson${c._count.lessons === 1 ? " uses" : "s use"} "${c.name}". Archive it instead.`);
  await db.lessonCategory.delete({ where: { id } });
}

/** The category id a lesson may be given: one of this school's, or null. */
export async function checkLessonCategory(db: PrismaClient, organizationId: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const c = await db.lessonCategory.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!c) throw new CategoryError("Category not found");
  return c.id;
}
