-- AlterTable
ALTER TABLE "tenants"
  ADD COLUMN "autoSendOverdueNotifications" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoSendPaymentConfirmations" BOOLEAN NOT NULL DEFAULT false;
