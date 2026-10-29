-- Seguridad: el proyecto Supabase expone una API REST pública (PostgREST) sobre
-- todas las tablas del esquema `public`. Sin Row-Level Security, cualquiera con la
-- URL del proyecto + la anon key puede leer/editar/borrar datos, saltándose Clerk
-- y el filtro de tenantId. Esto disparó el aviso `rls_disabled_in_public`.
--
-- Rex NO usa la API de Supabase: todo el acceso a datos va por Prisma con el rol
-- dueño de las tablas, que por defecto IGNORA RLS (solo FORCE ROW LEVEL SECURITY lo
-- sujetaría, y aquí NO se usa). Por eso activar RLS sin políticas bloquea a los roles
-- anon/authenticated de la API pública pero no afecta a la app.

-- Enable RLS on every base table in the public schema. No policies are created,
-- so anon/authenticated get zero access through the Supabase data API, while the
-- table-owner connection used by Prisma keeps full access.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
