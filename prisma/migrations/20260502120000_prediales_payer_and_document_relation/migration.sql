-- DropIndex
DROP INDEX "cadastral_payments_propertyId_year_installment_key";

-- AlterTable
ALTER TABLE "cadastral_payments"
  DROP COLUMN "installment",
  DROP COLUMN "receiptUrl",
  ALTER COLUMN "totalAmount" DROP NOT NULL,
  ADD COLUMN "payerEntityId" TEXT,
  ADD COLUMN "paidByThirdPartyName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cadastral_payments_propertyId_year_key" ON "cadastral_payments"("propertyId", "year");

-- AddForeignKey
ALTER TABLE "cadastral_payments" ADD CONSTRAINT "cadastral_payments_payerEntityId_fkey" FOREIGN KEY ("payerEntityId") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "cadastralPaymentId" TEXT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_cadastralPaymentId_fkey" FOREIGN KEY ("cadastralPaymentId") REFERENCES "cadastral_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
