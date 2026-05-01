-- CreateTable
CREATE TABLE "morosity_daily_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "byStatus" JSONB NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "overdueAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "morosity_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "morosity_daily_snapshots_tenantId_idx" ON "morosity_daily_snapshots"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "morosity_daily_snapshots_tenantId_date_key" ON "morosity_daily_snapshots"("tenantId", "date");

-- AddForeignKey
ALTER TABLE "morosity_daily_snapshots" ADD CONSTRAINT "morosity_daily_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
