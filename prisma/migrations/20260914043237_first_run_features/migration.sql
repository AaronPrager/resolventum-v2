-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('INQUIRY', 'CONSULT_BOOKED', 'TRIAL', 'ENROLLED', 'LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageKind" ADD VALUE 'SESSION_NOTE';
ALTER TYPE "MessageKind" ADD VALUE 'LOW_BALANCE_ALERT';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "emailNotes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailReminders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "sourceLessonId" TEXT;

-- AlterTable
ALTER TABLE "LessonSeries" ADD COLUMN     "skipHolidays" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "lateCancelChargePercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "lateCancelHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "lowBalanceAlertCents" INTEGER,
ADD COLUMN     "makeupOnLateCancel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noShowChargePercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "sessionNotesAuto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Tutor" ADD COLUMN     "availability" TEXT,
ADD COLUMN     "hourlyClientRateCents" INTEGER,
ADD COLUMN     "payPercent" INTEGER,
ADD COLUMN     "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorPayRate" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "hourlyPayRateCents" INTEGER,
    "payPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorPayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "covered" TEXT NOT NULL,
    "homework" TEXT,
    "engagement" INTEGER,
    "win" TEXT,
    "struggle" TEXT,
    "nextGoal" TEXT,
    "sharedAt" TIMESTAMP(3),
    "sharedTo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'INQUIRY',
    "studentFirstName" TEXT NOT NULL,
    "studentLastName" TEXT NOT NULL,
    "grade" TEXT,
    "schoolName" TEXT,
    "studentEmail" TEXT,
    "studentPhone" TEXT,
    "parentName" TEXT NOT NULL,
    "parentEmail" TEXT,
    "parentPhone" TEXT,
    "subjects" TEXT,
    "goals" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "consultAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "studentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_organizationId_startsOn_idx" ON "Holiday"("organizationId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "TutorPayRate_tutorId_subject_key" ON "TutorPayRate"("tutorId", "subject");

-- CreateIndex
CREATE INDEX "SessionNote_studentId_createdAt_idx" ON "SessionNote"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionNote_organizationId_sharedAt_idx" ON "SessionNote"("organizationId", "sharedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionNote_lessonId_studentId_key" ON "SessionNote"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_createdAt_idx" ON "Lead"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_subjectType_subjectId_idx" ON "AuditEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Charge_sourceLessonId_idx" ON "Charge"("sourceLessonId");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorPayRate" ADD CONSTRAINT "TutorPayRate_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_sourceLessonId_fkey" FOREIGN KEY ("sourceLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
