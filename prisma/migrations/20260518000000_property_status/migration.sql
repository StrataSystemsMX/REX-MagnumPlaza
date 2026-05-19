-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVO', 'BLOQUEADO');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVO';
