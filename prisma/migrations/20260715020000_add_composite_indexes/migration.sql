-- Índices compuestos para las queries más frecuentes (cron de morosidad,
-- matrices de cobranza, reportes por concepto/inmueble).

-- CreateIndex
CREATE INDEX "contracts_tenantId_status_idx" ON "contracts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "rents_tenantId_status_idx" ON "rents"("tenantId", "status");

-- CreateIndex
CREATE INDEX "rents_tenantId_period_idx" ON "rents"("tenantId", "period");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_propertyId_idx" ON "expenses"("propertyId");
