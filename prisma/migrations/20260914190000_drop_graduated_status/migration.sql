-- Graduated goes away. Anyone graduated is archived instead, and the enum shrinks to ACTIVE and PAUSED.
UPDATE "Student" SET status = 'ACTIVE', "archivedAt" = COALESCE("archivedAt", now()) WHERE status = 'GRADUATED';
ALTER TYPE "StudentStatus" RENAME TO "StudentStatus_old";
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'PAUSED');
ALTER TABLE "Student" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Student" ALTER COLUMN "status" TYPE "StudentStatus" USING ("status"::text::"StudentStatus");
ALTER TABLE "Student" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "StudentStatus_old";
