-- ============================================================================
-- 44 — v_estadisticas_diarias: desglose por forma de cobro (transferencia / efectivo)
-- Requiere: columnas pedidos.forma_pago_total, forma_pago_sena (p. ej. 38)
-- ============================================================================
-- total_ingresos: sin cambios (toda la venta del pedido en el día).
-- ingresos_transferencia / ingresos_efectivo / ingresos_sin_forma: según
-- COALESCE(forma_pago_total, forma_pago_sena) — misma regla que la app para
-- clasificar el pedido (pago total prioriza sobre seña).
-- Facturación ARCA (pantalla Facturación): solo entregados con forma_pago_total
-- = transferencia; el efectivo no entra en ese flujo.

DROP VIEW IF EXISTS public.v_estadisticas_diarias CASCADE;

CREATE VIEW public.v_estadisticas_diarias AS
WITH base AS (
  SELECT
    p.id AS pedido_id,
    (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
    COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
  FROM public.pedidos p
  WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
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
    COALESCE(c.costo_insumos, 0)::numeric AS costo,
    COALESCE(p.comision_monto, 0)::numeric AS comision,
    COALESCE(p.forma_pago_total, p.forma_pago_sena) AS forma_cobro
  FROM base b
  LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
  LEFT JOIN costos c ON c.pedido_id = b.pedido_id
  INNER JOIN public.pedidos p ON p.id = b.pedido_id
)
SELECT
  dia,
  SUM(venta)::numeric AS total_ingresos,
  SUM(CASE WHEN forma_cobro = 'transferencia' THEN venta ELSE 0 END)::numeric
    AS ingresos_transferencia,
  SUM(CASE WHEN forma_cobro = 'efectivo' THEN venta ELSE 0 END)::numeric
    AS ingresos_efectivo,
  SUM(CASE WHEN forma_cobro IS NULL THEN venta ELSE 0 END)::numeric
    AS ingresos_sin_forma,
  SUM(costo)::numeric AS total_insumos,
  SUM(comision)::numeric AS total_comisiones,
  (SUM(venta) - SUM(costo) - SUM(comision))::numeric AS ganancia_neta,
  CASE
    WHEN SUM(venta) > 0 THEN
      ROUND(
        ((SUM(venta) - SUM(costo) - SUM(comision)) / NULLIF(SUM(venta), 0) * 100)::numeric,
        2
      )
    ELSE 0::numeric
  END AS pct_margen_real
FROM por_pedido
GROUP BY dia;

COMMENT ON VIEW public.v_estadisticas_diarias IS
  'Por día (AR): ingresos totales y desglose transferencia/efectivo/sin dato; insumos BOM; comisiones.';

GRANT SELECT ON public.v_estadisticas_diarias TO authenticated;
