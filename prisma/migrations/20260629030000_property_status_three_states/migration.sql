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

-- 4. Convertir la columna con un mapeo simple por valor. Postgres NO admite
--    subconsultas en la expresión USING de un ALTER COLUMN TYPE, así que aquí
--    solo se mapea BLOQUEADO -> BLOQUEADO y todo lo demás (ACTIVO) -> DISPONIBLE.
ALTER TABLE "properties" ALTER COLUMN "status" TYPE "PropertyStatus" USING (
  CASE "status"::text
    WHEN 'BLOQUEADO' THEN 'BLOQUEADO'
    ELSE 'DISPONIBLE'
  END
)::"PropertyStatus";

-- 5. Marcar EN_RENTA las propiedades con al menos un contrato ACTIVE.
--    El UPDATE sí admite subconsultas (a diferencia del USING de arriba).
UPDATE "properties" p
SET "status" = 'EN_RENTA'
WHERE p."status" = 'DISPONIBLE'
  AND EXISTS (
    SELECT 1
    FROM "contracts" c
    JOIN "units" u ON u."id" = c."unitId"
    WHERE u."propertyId" = p."id"
      AND c."status" = 'ACTIVE'
  );

-- 6. Nuevo default.
ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'DISPONIBLE';

-- 7. Eliminar el enum viejo.
DROP TYPE "PropertyStatus_old";
