-- Fix: payrolls_legalEntityId_fkey should CASCADE on LegalEntity delete (schema drift)
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_legalEntityId_fkey";
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
