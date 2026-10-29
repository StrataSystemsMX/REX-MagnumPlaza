-- Canal de origen del interesado: DIGITAL (liga compartida) o PHYSICAL (QR de
-- lona/impreso). Default DIGITAL para no afectar leads existentes.
CREATE TYPE "LeadSource" AS ENUM ('DIGITAL', 'PHYSICAL');

ALTER TABLE "leads" ADD COLUMN "source" "LeadSource" NOT NULL DEFAULT 'DIGITAL';
