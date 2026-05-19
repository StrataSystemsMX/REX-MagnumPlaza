-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('VEHICLE', 'MORTGAGE', 'PERSONAL', 'CORPORATE', 'LINE_OF_CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'REFINANCED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvestmentProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT,
    "type" "LoanType" NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL,
    "monthlyPayment" DECIMAL(12,2) NOT NULL,
    "interestRate" DECIMAL(6,4),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "paymentDay" INTEGER,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "principal" DECIMAL(12,2),
    "interest" DECIMAL(12,2),
    "paymentDate" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budgetAmount" DECIMAL(12,2) NOT NULL,
    "executedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "InvestmentProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loans_tenantId_idx" ON "loans"("tenantId");

-- CreateIndex
CREATE INDEX "loans_legalEntityId_idx" ON "loans"("legalEntityId");

-- CreateIndex
CREATE INDEX "loan_payments_tenantId_idx" ON "loan_payments"("tenantId");

-- CreateIndex
CREATE INDEX "loan_payments_period_idx" ON "loan_payments"("period");

-- CreateIndex
CREATE UNIQUE INDEX "loan_payments_loanId_period_key" ON "loan_payments"("loanId", "period");

-- CreateIndex
CREATE INDEX "investment_projects_tenantId_idx" ON "investment_projects"("tenantId");

-- CreateIndex
CREATE INDEX "investment_payments_tenantId_idx" ON "investment_payments"("tenantId");

-- CreateIndex
CREATE INDEX "investment_payments_projectId_idx" ON "investment_payments"("projectId");

-- CreateIndex
CREATE INDEX "investment_payments_paymentDate_idx" ON "investment_payments"("paymentDate");

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_projects" ADD CONSTRAINT "investment_projects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_projects" ADD CONSTRAINT "investment_projects_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_projects" ADD CONSTRAINT "investment_projects_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_payments" ADD CONSTRAINT "investment_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_payments" ADD CONSTRAINT "investment_payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "investment_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
