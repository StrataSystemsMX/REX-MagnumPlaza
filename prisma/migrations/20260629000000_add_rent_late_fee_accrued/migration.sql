-- Interés moratorio acumulado por renta (política CRT: 5% mensual prorrateado).
-- Snapshot recalculado por el cron diario y por recalcRentInTx en cada pago.
-- Se suma al adeudo total vía computeBalance.
ALTER TABLE "rents" ADD COLUMN "lateFeeAccrued" DECIMAL(12,2) NOT NULL DEFAULT 0;
