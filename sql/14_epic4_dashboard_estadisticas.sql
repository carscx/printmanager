-- ============================================================================
-- 14 — Épica 4: Dashboard rentabilidad y alertas de stock
-- Requiere: 01 (pedidos, pedido_items), 05 (pedido_items_insumos)
-- No modifica funciones de costo/BOM de épicas anteriores.
-- ============================================================================

-- Zona horaria para agrupar por "día" local (Argentina)
-- ---------------------------------------------------------------------------

-- ── Vista: una fila por día calendario con métricas de rentabilidad ─────────
-- Pedidos incluidos: estados operativos posteriores al presupuesto (tienen BOM).
-- Ingresos: suma de subtotal_item por ítem; si no hay líneas con monto, cabecera.
-- Costo: suma de pedido_items_insumos.costo_total (BOM congelado).

CREATE OR REPLACE VIEW public.v_estadisticas_diarias AS
WITH base AS (
  SELECT
    p.id AS pedido_id,
    (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
    COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
  FROM public.pedidos p
  WHERE p.estado IN ('señado', 'listo', 'entregado')
),
venta_items AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
  FROM public.pedido_items pi
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
costos AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pii.costo_total, 0))::numeric AS costo_insumos
  FROM public.pedido_items pi
  INNER JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
por_pedido AS (
  SELECT
    b.dia,
    b.pedido_id,
    CASE
      WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
      ELSE COALESCE(b.total_cabecera, 0)
    END AS venta,
    COALESCE(c.costo_insumos, 0)::numeric AS costo
  FROM base b
  LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
  LEFT JOIN costos c ON c.pedido_id = b.pedido_id
)
SELECT
  dia,
  SUM(venta)::numeric AS total_facturado,
  SUM(costo)::numeric AS costo_insumos_total,
  (SUM(venta) - SUM(costo))::numeric AS ganancia_neta,
  CASE
    WHEN SUM(venta) > 0 THEN
      ROUND(((SUM(venta) - SUM(costo)) / NULLIF(SUM(venta), 0) * 100)::numeric, 2)
    ELSE 0::numeric
  END AS pct_margen_real
FROM por_pedido
GROUP BY dia;

COMMENT ON VIEW public.v_estadisticas_diarias IS
  'Por día (AR): ventas vs costo BOM (pedido_items_insumos), solo pedidos señado/listo/entregado.';

-- ── Vista: insumos en alerta (para listados sin comparar columnas en REST) ───

CREATE OR REPLACE VIEW public.v_insumos_alerta_stock AS
SELECT i.*
FROM public.insumos i
WHERE i.activo = true
  AND i.stock_actual <= i.stock_minimo;

COMMENT ON VIEW public.v_insumos_alerta_stock IS
  'stock_actual <= stock_minimo (incluye cero o negativo si aplica).';

-- ── Top productos por margen en rango de fechas ─────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_dashboard_top_productos_margen(
  p_desde date,
  p_hasta date,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  producto text,
  margen_neto numeric,
  venta_total numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lineas AS (
    SELECT
      COALESCE(
        NULLIF(TRIM(pi.nombre_archivo), ''),
        CONCAT(
          COALESCE(pi.tipo_impresion, 'item'),
          ' · ',
          COALESCE(pi.anillado, '—')
        )
      ) AS lbl,
      COALESCE(pi.subtotal_item, 0)::numeric AS v,
      COALESCE((
        SELECT SUM(pii.costo_total)
        FROM public.pedido_items_insumos pii
        WHERE pii.pedido_item_id = pi.id
      ), 0)::numeric AS c
    FROM public.pedido_items pi
    INNER JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE p.estado IN ('señado', 'pagado', 'listo', 'entregado')
      AND (timezone('America/Argentina/Buenos_Aires', p.created_at))::date
        BETWEEN p_desde AND p_hasta
  )
  SELECT
    lineas.lbl AS producto,
    SUM(lineas.v - lineas.c)::numeric AS margen_neto,
    SUM(lineas.v)::numeric AS venta_total
  FROM lineas
  GROUP BY lineas.lbl
  ORDER BY SUM(lineas.v - lineas.c) DESC NULLS LAST
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
$$;

COMMENT ON FUNCTION public.fn_dashboard_top_productos_margen(date, date, integer) IS
  'Top líneas de pedido por margen (venta ítem − costo BOM) en rango de fechas.';

-- ── Conteo de pedidos activos (no entregados / no cancelados) ───────────────

CREATE OR REPLACE FUNCTION public.fn_dashboard_pedidos_pendientes()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.pedidos p
  WHERE p.estado IS DISTINCT FROM 'cancelado'
    AND p.estado IS DISTINCT FROM 'entregado'
    AND COALESCE(p.entregado, false) = false;
$$;

-- Grants (Supabase: rol authenticated)
GRANT SELECT ON public.v_estadisticas_diarias TO authenticated;
GRANT SELECT ON public.v_insumos_alerta_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_top_productos_margen(date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_pedidos_pendientes() TO authenticated;
