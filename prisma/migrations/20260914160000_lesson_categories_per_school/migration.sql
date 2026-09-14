-- Lesson categories become a per-school list instead of a fixed enum. Every school that had
-- lessons marked TUTORING gets a "Tutoring" category and those lessons point at it.
ALTER TYPE "LessonCategory" RENAME TO "LessonCategory_enum";

CREATE TABLE "LessonCategory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonCategory_organizationId_name_key" ON "LessonCategory"("organizationId", "name");
CREATE INDEX "LessonCategory_organizationId_archivedAt_idx" ON "LessonCategory"("organizationId", "archivedAt");
ALTER TABLE "LessonCategory" ADD CONSTRAINT "LessonCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lesson" ADD COLUMN "categoryId" TEXT;

INSERT INTO "LessonCategory" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "organizationId", 'Tutoring', now(), now()
FROM "Lesson" WHERE "category" = 'TUTORING' GROUP BY "organizationId";

UPDATE "Lesson" l SET "categoryId" = c."id"
FROM "LessonCategory" c
WHERE l."category" = 'TUTORING' AND c."organizationId" = l."organizationId" AND c."name" = 'Tutoring';

ALTER TABLE "Lesson" DROP COLUMN "category";
DROP TYPE "LessonCategory_enum";

CREATE INDEX "Lesson_categoryId_idx" ON "Lesson"("categoryId");
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LessonCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
