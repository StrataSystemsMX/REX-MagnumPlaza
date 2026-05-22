-- AlterTable
ALTER TABLE "units" ADD COLUMN     "parentUnitId" TEXT;

-- CreateIndex
CREATE INDEX "units_parentUnitId_idx" ON "units"("parentUnitId");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_parentUnitId_fkey" FOREIGN KEY ("parentUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
