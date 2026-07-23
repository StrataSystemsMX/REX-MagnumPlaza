-- Archivar conceptos de egreso: isActive oculta el concepto de la captura sin
-- borrar el historial. Default true para no afectar categorías existentes.
ALTER TABLE "expense_categories" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
