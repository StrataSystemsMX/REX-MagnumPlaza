-- CadastralPayment era la única tabla tenant-scoped sin FK a tenants: su
-- limpieza dependía del cascade indirecto vía properties. Se alinea con el
-- resto de los modelos (onDelete: Cascade directo).

-- AddForeignKey
ALTER TABLE "cadastral_payments" ADD CONSTRAINT "cadastral_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
