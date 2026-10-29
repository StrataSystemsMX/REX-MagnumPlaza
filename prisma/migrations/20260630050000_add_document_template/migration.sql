-- Plantilla editable de aviso de mora por tenant y nivel. Si no hay fila para
-- (tenantId, level), el generador usa el texto fijo de template-config.ts.
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "level" VARCHAR(4) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "greeting" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "legalNote" TEXT NOT NULL,
    "closing" VARCHAR(600) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_templates_tenantId_idx" ON "document_templates"("tenantId");
CREATE UNIQUE INDEX "document_templates_tenantId_level_key" ON "document_templates"("tenantId", "level");

ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
