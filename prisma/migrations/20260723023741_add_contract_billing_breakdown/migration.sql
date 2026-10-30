-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "bankAccount" VARCHAR(30),
ADD COLUMN     "baseRent" DECIMAL(12,2),
ADD COLUMN     "maintenanceFee" DECIMAL(12,2),
ADD COLUMN     "paymentMethodNote" VARCHAR(60);
