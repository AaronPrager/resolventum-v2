-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "agreementTemplate" TEXT,
ADD COLUMN     "intakeCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_intakeCode_key" ON "Organization"("intakeCode");

