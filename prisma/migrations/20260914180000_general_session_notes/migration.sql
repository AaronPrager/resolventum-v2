-- A session note may now be general, with no lesson. Every note gets the day it is about:
-- the lesson's day for existing notes. Dates are taken in UTC, which is the lesson's own
-- calendar day except for lessons close to midnight; good enough for ordering.
ALTER TABLE "SessionNote" ALTER COLUMN "lessonId" DROP NOT NULL;
ALTER TABLE "SessionNote" ADD COLUMN "notedOn" DATE;
UPDATE "SessionNote" n SET "notedOn" = (l."startsAt")::date FROM "Lesson" l WHERE l."id" = n."lessonId";
UPDATE "SessionNote" SET "notedOn" = ("createdAt")::date WHERE "notedOn" IS NULL;
ALTER TABLE "SessionNote" ALTER COLUMN "notedOn" SET NOT NULL;
DROP INDEX IF EXISTS "SessionNote_studentId_createdAt_idx";
CREATE INDEX "SessionNote_studentId_notedOn_idx" ON "SessionNote"("studentId", "notedOn");
