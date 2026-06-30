-- Tres estados de propiedad: ACTIVO se divide en DISPONIBLE / EN_RENTA según
-- ocupación. BLOQUEADO se conserva. Postgres no permite quitar valores de un
-- enum, así que se hace el swap completo del tipo (rename -> create -> convert
-- -> drop) dentro de la transacción de la migración.

-- 1. Renombrar el enum viejo.
ALTER TYPE "PropertyStatus" RENAME TO "PropertyStatus_old";

-- 2. Crear el enum nuevo.
CREATE TYPE "PropertyStatus" AS ENUM ('DISPONIBLE', 'EN_RENTA', 'BLOQUEADO');

-- 3. Quitar el default (depende del tipo viejo).
ALTER TABLE "properties" ALTER COLUMN "status" DROP DEFAULT;

-- 4. Convertir la columna mapeando valores:
--    BLOQUEADO                          -> BLOQUEADO
--    (ACTIVO) con contrato ACTIVE       -> EN_RENTA
--    (ACTIVO) sin contrato ACTIVE       -> DISPONIBLE
ALTER TABLE "properties" ALTER COLUMN "status" TYPE "PropertyStatus" USING (
  CASE
    WHEN "status"::text = 'BLOQUEADO' THEN 'BLOQUEADO'
    WHEN EXISTS (
      SELECT 1
      FROM "contracts" c
      JOIN "units" u ON u."id" = c."unitId"
      WHERE u."propertyId" = "properties"."id"
        AND c."status" = 'ACTIVE'
    ) THEN 'EN_RENTA'
    ELSE 'DISPONIBLE'
  END
)::"PropertyStatus";

-- 5. Nuevo default.
ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'DISPONIBLE';

-- 6. Eliminar el enum viejo.
DROP TYPE "PropertyStatus_old";
