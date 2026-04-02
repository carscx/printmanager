-- ============================================================================
-- 56 — Tóner: gramos por cartucho y mg por cara (derivado de páginas/cartucho)
-- Requiere: insumos existente
--
-- El rendimiento (páginas por cartucho) en app y SQL sigue siendo
-- round((gramos_cartucho * 1000) / mg_por_cara). Stock en BD sigue en “carillas”.
-- ============================================================================

ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS toner_gramos_por_cartucho numeric,
  ADD COLUMN IF NOT EXISTS toner_mg_por_cara numeric;

COMMENT ON COLUMN public.insumos.toner_gramos_por_cartucho IS
  'Tóner: gramos de tóner por cartucho (ej. 60).';
COMMENT ON COLUMN public.insumos.toner_mg_por_cara IS
  'Tóner: mg depositados por cara impresa (A4, cobertura de referencia; ej. 60 ≈ 0,06 g).';

UPDATE public.insumos
SET
  toner_gramos_por_cartucho = COALESCE(toner_gramos_por_cartucho, 60),
  toner_mg_por_cara = COALESCE(toner_mg_por_cara, 60)
WHERE categoria = 'toner';

-- Alinear rendimiento con física (60 g → 60000 mg / 60 mg/cara = 1000 pág)
UPDATE public.insumos i
SET rendimiento = GREATEST(
  1,
  round(
    (COALESCE(i.toner_gramos_por_cartucho, 60)::numeric * 1000.0)
    / NULLIF(GREATEST(COALESCE(i.toner_mg_por_cara, 60), 1)::numeric, 0)
  )::integer
)
WHERE i.categoria = 'toner';
