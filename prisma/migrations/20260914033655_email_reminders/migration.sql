-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dailyScheduleAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyScheduleEmail" TEXT,
ADD COLUMN     "lessonRemindersAuto" BOOLEAN NOT NULL DEFAULT false;
