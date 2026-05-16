-- AlterTable
ALTER TABLE "rents" ADD COLUMN "amountWaived" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Backfill: rentas que ya estaban en WAIVED → consideramos que se condonó el
-- saldo pendiente al momento de marcarse como condonadas.
UPDATE "rents"
   SET "amountWaived" = "amountDue" - "amountPaid"
 WHERE "status" = 'WAIVED'
   AND "amountWaived" = 0;
