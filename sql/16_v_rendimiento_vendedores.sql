-- ============================================================================
-- 16 — Vista v_rendimiento_vendedores (ranking acumulado)
-- Requiere: 15 (vendedor_id, comision_monto, profiles)
-- Sincroniza con el dashboard: lectura desde la vista (sin RPC por período).
-- ============================================================================
-- REPLACE no puede renombrar columnas (p. ej. vendedor → nombre en BD manual).
DROP VIEW IF EXISTS public.v_rendimiento_vendedores CASCADE;

CREATE VIEW public.v_rendimiento_vendedores AS
WITH base AS (
  SELECT
    p.id AS pedido_id,
    p.vendedor_id,
    COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
  FROM public.pedidos p
  WHERE p.estado IN ('señado', 'pagado', 'listo', 'entregado')
    AND p.vendedor_id IS NOT NULL
),
venta_items AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
  FROM public.pedido_items pi
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
por_pedido AS (
  SELECT
    b.pedido_id,
    b.vendedor_id,
    CASE
      WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
      ELSE COALESCE(b.total_cabecera, 0)
    END AS venta,
    COALESCE(p.comision_monto, 0)::numeric AS comision
  FROM base b
  LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
  INNER JOIN public.pedidos p ON p.id = b.pedido_id
),
agg AS (
  SELECT
    vendedor_id,
    COUNT(DISTINCT pedido_id)::bigint AS pedidos,
    SUM(venta)::numeric AS total_facturado,
    SUM(comision)::numeric AS comision_acumulada
  FROM por_pedido
  GROUP BY vendedor_id
)
SELECT
  a.vendedor_id,
  COALESCE(NULLIF(TRIM(pr.full_name), ''), pr.id::text)::text AS nombre,
  a.pedidos,
  a.total_facturado,
  a.comision_acumulada
FROM agg a
INNER JOIN public.profiles pr ON pr.id = a.vendedor_id
ORDER BY a.total_facturado DESC NULLS LAST;

COMMENT ON VIEW public.v_rendimiento_vendedores IS
  'Por vendedor: pedidos cerrados (señado/pagado/listo/entregado), total facturado y comisión (pedidos.comision_monto).';

GRANT SELECT ON public.v_rendimiento_vendedores TO authenticated;
