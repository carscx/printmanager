-- ============================================================================
-- 24 — Migración datos: tinta stock en ml → carillas (unidades mínimas consumo)
-- ============================================================================
-- Ubicación: archive/ — no va en instalaciones nuevas (ver archive/README.md).
--
-- ⚠️ Obsoleto para el modelo actual: stock de tinta en **ml**, rendimiento **30 páginas/ml**
-- (ver `27_epic5_borrar_insumos_impresion_maestros_tinta_ml.sql`). No ejecutar en bases
-- nuevas ni si ya aplicaste el maestro por ml.
--
-- CONTEXTO
--   El frontend guarda tinta como: carillas = ml × (rendimiento ÷ 1000),
--   con rendimiento por defecto 30.000 carillas por litro de compra.
--   Filas antiguas podían tener stock_actual / stock_minimo en **ml**.
--
-- QUÉ HACE
--   Multiplica stock_actual y stock_minimo por (COALESCE(rendimiento, 30000) / 1000)
--   solo para insumos categoria = 'tinta'.
--
-- IMPORTANTE
--   • Ejecutar **una sola vez** por base (PROD/DEV) donde el stock de tinta
--     siga en ml. Si ya corriste este script o cargaste datos ya en carillas,
--     NO lo vuelvas a ejecutar (inflaría el stock ×30).
--   • Hacé backup o probá antes en copia.
--
-- VERIFICACIÓN (opcional, antes de actualizar):
--   SELECT id, nombre, rendimiento, stock_actual, stock_minimo
--   FROM public.insumos
--   WHERE categoria = 'tinta';
-- ============================================================================

BEGIN;

UPDATE public.insumos i
SET
  stock_actual = round(
    (i.stock_actual * (COALESCE(i.rendimiento, 30000)::numeric / 1000.0))::numeric,
    4
  ),
  stock_minimo = round(
    (i.stock_minimo * (COALESCE(i.rendimiento, 30000)::numeric / 1000.0))::numeric,
    4
  ),
  updated_at = now()
WHERE i.categoria = 'tinta';

COMMIT;
