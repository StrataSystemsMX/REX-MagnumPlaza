-- Contacto de la oficina (Eli) para recibir copia de los avisos de cobranza.
ALTER TABLE "tenants" ADD COLUMN "officeEmail" VARCHAR(254);
ALTER TABLE "tenants" ADD COLUMN "officeWhatsapp" VARCHAR(20);

-- Nuevo destinatario de notificación: copia interna a la oficina.
ALTER TYPE "NotificationRecipientType" ADD VALUE 'OFFICE';
