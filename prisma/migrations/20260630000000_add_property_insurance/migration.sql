-- Seguro del inmueble: aseguradora, número de póliza y fecha de vencimiento.
-- insuranceExpiresAt alimenta las alertas de vencimiento (dashboard + inmueble);
-- se indexa para detectar pólizas vencidas o próximas a vencer de forma eficiente.
ALTER TABLE "properties" ADD COLUMN "insuranceProvider" VARCHAR(80);
ALTER TABLE "properties" ADD COLUMN "insurancePolicyNumber" VARCHAR(50);
ALTER TABLE "properties" ADD COLUMN "insuranceExpiresAt" TIMESTAMP(3);

CREATE INDEX "properties_insuranceExpiresAt_idx" ON "properties"("insuranceExpiresAt");
