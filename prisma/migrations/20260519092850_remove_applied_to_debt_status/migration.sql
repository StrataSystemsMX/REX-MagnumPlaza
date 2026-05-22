-- Convertir fianzas legacy APPLIED_TO_DEBT a RETURNED con $0 devuelto.
-- El depósito se quedó en la empresa para saldar deuda, así que semánticamente
-- no se "devolvió" dinero al inquilino — se marca como cerrado con monto 0.
UPDATE "guarantees"
SET
  "status" = 'RETURNED',
  "returnedAmount" = 0,
  "returnedDate" = COALESCE("returnedDate", NOW())
WHERE "status" = 'APPLIED_TO_DEBT';

-- Postgres no permite ALTER TYPE ... DROP VALUE, así que recreamos el enum.
CREATE TYPE "GuaranteeStatus_new" AS ENUM ('HELD', 'PARTIALLY_RETURNED', 'RETURNED');
ALTER TABLE "guarantees"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "GuaranteeStatus_new" USING ("status"::text::"GuaranteeStatus_new"),
  ALTER COLUMN "status" SET DEFAULT 'HELD';
DROP TYPE "GuaranteeStatus";
ALTER TYPE "GuaranteeStatus_new" RENAME TO "GuaranteeStatus";
