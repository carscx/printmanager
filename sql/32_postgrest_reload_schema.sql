-- ============================================================================
-- 32 — Forzar recarga de caché de PostgREST (API REST)
-- ============================================================================
-- Síntoma: PGRST204 "Could not find the 'nombre' column ... in the schema cache"
--          aunque la columna exista en PostgreSQL (p. ej. tras ejecutar el 31).
-- Ejecutar en SQL Editor del MISMO proyecto Supabase que usa la app.
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- Comprobación opcional (debería listar `nombre`):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'precios_impresion'
-- ORDER BY ordinal_position;
