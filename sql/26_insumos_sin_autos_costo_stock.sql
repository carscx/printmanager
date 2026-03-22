-- ============================================================================
-- 26 — Insumos: sin triggers que alteren costo/stock al guardar (predecible)
-- ============================================================================
-- Quita `trg_insumos_sync_costo_base`: la BD ya no copia `precio_compra` →
-- `costo_base` automáticamente. El frontend envía los valores finales.
-- No hay triggers en `insumos` que multipliquen `stock_actual`; el stock en
-- unidades de consumo lo calcula solo la app.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_insumos_sync_costo_base ON public.insumos;

DROP FUNCTION IF EXISTS public.trg_insumos_sync_costo_base();

COMMENT ON COLUMN public.insumos.stock_actual IS
  'Unidades mínimas de consumo (hojas, carillas, etc.); valor final enviado por la app.';

COMMENT ON COLUMN public.insumos.costo_base IS
  'Costo del lote de compra; debe alinearse con precio_compra desde la app si aplica.';
