-- College counseling is no longer a lesson category. Any lesson still marked with it (none in the
-- data this was written against) becomes uncategorized, then the value is dropped from the enum.
UPDATE "Lesson" SET "category" = NULL WHERE "category" = 'COLLEGE_COUNSELING';
ALTER TYPE "LessonCategory" RENAME TO "LessonCategory_old";
CREATE TYPE "LessonCategory" AS ENUM ('TUTORING');
ALTER TABLE "Lesson" ALTER COLUMN "category" TYPE "LessonCategory" USING ("category"::text::"LessonCategory");
DROP TYPE "LessonCategory_old";
