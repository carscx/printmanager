-- ============================================================================
-- 46 — Ampliar tipo de tarifa de impresión: stickers (p. ej. plancha adhesiva)
-- ============================================================================
-- Antes: CHECK (tipo IN ('bn', 'color')) bloqueaba nuevos productos en tarifas.
-- Ahora: se permite 'stickers' (misma unicidad activa por tipo + doble_faz que 31).
-- Requiere: 05, 31 (precios_impresion con nombre).
-- ============================================================================

DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'precios_impresion'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%tipo%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.precios_impresion DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.precios_impresion
  ADD CONSTRAINT precios_impresion_tipo_check
  CHECK (tipo IN ('bn', 'color', 'stickers'));

COMMENT ON CONSTRAINT precios_impresion_tipo_check ON public.precios_impresion IS
  'bn / color / stickers: el cotizador y reglas usan tipo + doble_faz.';

NOTIFY pgrst, 'reload schema';
