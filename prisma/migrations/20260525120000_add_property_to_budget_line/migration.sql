-- AlterTable
ALTER TABLE "budget_lines" ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE INDEX "budget_lines_propertyId_idx" ON "budget_lines"("propertyId");

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
