-- CreateEnum
CREATE TYPE "IncludedService" AS ENUM ('AGUA', 'LUZ', 'GAS', 'INTERNET', 'MANTENIMIENTO', 'VIGILANCIA', 'ESTACIONAMIENTO');

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "depositMonths" INTEGER,
ADD COLUMN     "includedServices" "IncludedService"[] DEFAULT ARRAY[]::"IncludedService"[],
ADD COLUMN     "maintenanceFee" DECIMAL(12,2),
ADD COLUMN     "minContractMonths" INTEGER;
