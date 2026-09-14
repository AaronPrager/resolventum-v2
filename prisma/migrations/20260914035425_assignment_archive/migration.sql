-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Assignment_organizationId_archivedAt_idx" ON "Assignment"("organizationId", "archivedAt");
