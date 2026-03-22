-- ============================================================================
-- 30 — Privilegios para rol `authenticated` (PostgREST / API con JWT)
-- ============================================================================
-- Síntoma: 403 / `permission denied for table pedidos` (42501) aunque RLS
-- esté bien y el usuario sea admin: falta GRANT sobre el esquema/tablas.
-- Ejecutar una vez en Supabase (SQL Editor), como postgres / dashboard.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

-- Tablas, vistas y secuencias ya existentes
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Objetos que se creen después (migraciones nuevas)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- RPC / funciones expuestas (muchas ya tienen GRANT en scripts sueltos; esto cubre huecos)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
