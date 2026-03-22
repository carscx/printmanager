-- ============================================================================
-- 31 — Tarifas de impresión: ABM (varias filas por tipo/faz; una activa por combo)
-- ============================================================================
-- Antes: UNIQUE (tipo, doble_faz) impedía más de una tarifa por combinación.
-- Ahora: varias tarifas (p. ej. borradores inactivos); solo puede haber una
--        ACTIVA por (tipo, doble_faz) — índice único parcial.
-- Requiere: 05 (precios_impresion).
-- ============================================================================

-- Quitar UNIQUE (tipo, doble_faz) — nombre típico en PG
ALTER TABLE public.precios_impresion
  DROP CONSTRAINT IF EXISTS precios_impresion_tipo_doble_faz_key;

-- Por si el nombre del constraint difiere entre instancias
DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'precios_impresion'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%tipo%'
    AND pg_get_constraintdef(c.oid) LIKE '%doble_faz%';
  IF cname IS NOT NULL AND cname IS DISTINCT FROM 'precios_impresion_tipo_doble_faz_key' THEN
    EXECUTE format('ALTER TABLE public.precios_impresion DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.precios_impresion
  ADD COLUMN IF NOT EXISTS nombre TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.precios_impresion.nombre IS
  'Etiqueta opcional para distinguir tarifas (misma combinación tipo/faz).';

-- Solo una fila activa por (tipo, doble_faz)
DROP INDEX IF EXISTS public.precios_impresion_uniq_activo_tipo_doble;
CREATE UNIQUE INDEX precios_impresion_uniq_activo_tipo_doble
  ON public.precios_impresion (tipo, doble_faz)
  WHERE (activo = true);

-- PostgREST (API) cachea el esquema: sin esto puede seguir el error PGRST204 hasta minutos.
NOTIFY pgrst, 'reload schema';
