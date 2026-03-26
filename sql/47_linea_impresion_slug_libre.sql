-- ============================================================================
-- 47 — Línea de producto dinámica: slug libre + perfil de tinta (motor de costo)
-- ============================================================================
-- Quita el CHECK fijo sobre precios_impresion.tipo (46: bn/color/stickers).
-- tipo = slug estable (ej. candy_bar, pegatinas); nombre = etiqueta visible.
-- perfil_tinta = bn (tóner) | color (suma tintas): solo afecta el costo estimado
-- legacy en costEngine cuando no mandan reglas; las reglas/BOM siguen por tarifa.
-- Requiere: 31, 46 (o cualquier estado previo con precios_impresion).
-- ============================================================================

-- Quitar CHECK sobre tipo (cualquier nombre que tenga)
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
  ADD COLUMN IF NOT EXISTS perfil_tinta TEXT NOT NULL DEFAULT 'color';

ALTER TABLE public.precios_impresion
  DROP CONSTRAINT IF EXISTS precios_impresion_perfil_tinta_check;

ALTER TABLE public.precios_impresion
  ADD CONSTRAINT precios_impresion_perfil_tinta_check
  CHECK (perfil_tinta IN ('bn', 'color'));

COMMENT ON COLUMN public.precios_impresion.tipo IS
  'Slug de línea de producto (bn, color, candy_bar, …). Sin CHECK: nuevas líneas vía app.';

COMMENT ON COLUMN public.precios_impresion.perfil_tinta IS
  'bn = costo motor tóner; color = suma tintas (stickers, pegatinas, etc.).';

UPDATE public.precios_impresion
SET perfil_tinta = 'bn'
WHERE tipo = 'bn';

UPDATE public.precios_impresion
SET perfil_tinta = 'color'
WHERE tipo IS DISTINCT FROM 'bn';

NOTIFY pgrst, 'reload schema';
