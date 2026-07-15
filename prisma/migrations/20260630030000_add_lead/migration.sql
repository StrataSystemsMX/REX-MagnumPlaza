-- Lead capturado desde la página pública de una vacante ("Me interesa").
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "promoterLinkId" TEXT NOT NULL,
    "name" VARCHAR(120),
    "email" VARCHAR(254),
    "phone" VARCHAR(20),
    "message" VARCHAR(500),
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");
CREATE INDEX "leads_promoterLinkId_idx" ON "leads"("promoterLinkId");

ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_promoterLinkId_fkey" FOREIGN KEY ("promoterLinkId") REFERENCES "promoter_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
