-- ============================================================================
-- 42 — Diagnóstico: por qué un pedido NO aparece en Facturación (app)
--
-- La app lista pedidos que cumplen TODAS estas condiciones:
--   1. estado = 'entregado'
--   2. facturado = false
--   3. forma_pago_total = 'transferencia'  (efectivo no entra)
--   4. fecha_pago IS NOT NULL
--   5. fecha_pago entre "Desde" y "Hasta" (fechas del filtro en pantalla)
--
-- Ejecutar en Supabase SQL Editor (solo lectura salvo el bloque opcional al final).
-- ============================================================================

-- 1) Últimos pedidos (ej. 90 días): motivo si no califica para facturación
SELECT
  p.id,
  p.numero_publico,
  p.cliente,
  p.estado,
  p.facturado,
  p.forma_pago_total,
  p.fecha_pago,
  p.created_at,
  CASE
    WHEN lower(trim(COALESCE(p.estado, ''))) IS DISTINCT FROM 'entregado' THEN 'estado ≠ entregado'
    WHEN COALESCE(p.facturado, false) = true THEN 'ya marcado facturado'
    WHEN p.forma_pago_total IS DISTINCT FROM 'transferencia' THEN 'cobro total no es transferencia (efectivo o NULL)'
    WHEN p.fecha_pago IS NULL THEN 'sin fecha_pago'
    ELSE 'cumple filtros BD (falta solo que fecha_pago caiga en el rango Desde/Hasta de la app)'
  END AS motivo_facturacion
FROM public.pedidos p
WHERE p.created_at >= (now() - interval '90 days')
ORDER BY p.created_at DESC
LIMIT 200;

-- 2) Resumen: conteos por motivo (misma ventana 90 días)
WITH base AS (
  SELECT
    p.*,
    CASE
      WHEN lower(trim(COALESCE(p.estado, ''))) IS DISTINCT FROM 'entregado' THEN 'estado ≠ entregado'
      WHEN COALESCE(p.facturado, false) = true THEN 'ya facturado'
      WHEN p.forma_pago_total IS DISTINCT FROM 'transferencia' THEN 'no transferencia / NULL'
      WHEN p.fecha_pago IS NULL THEN 'sin fecha_pago'
      ELSE 'candidato (revisar rango de fechas en app)'
    END AS motivo
  FROM public.pedidos p
  WHERE p.created_at >= (now() - interval '90 days')
)
SELECT motivo, count(*)::bigint AS cantidad
FROM base
GROUP BY motivo
ORDER BY cantidad DESC;

-- 3) Pedidos entregados con cobro transferencia pero forma_pago_total NULL (candidatos a backfill manual)
--    Revisar en negocio antes de actualizar.
SELECT
  p.id,
  p.numero_publico,
  p.estado,
  p.forma_pago_total,
  p.fecha_pago,
  p.created_at
FROM public.pedidos p
WHERE lower(trim(COALESCE(p.estado, ''))) = 'entregado'
  AND COALESCE(p.facturado, false) = false
  AND p.forma_pago_total IS NULL
  AND p.fecha_pago IS NOT NULL
ORDER BY p.fecha_pago DESC
LIMIT 100;

-- ---------------------------------------------------------------------------
-- OPCIONAL (solo si confirmás que esos pedidos se cobraron por transferencia):
-- UPDATE public.pedidos
-- SET forma_pago_total = 'transferencia'
-- WHERE id IN ('uuid-1', 'uuid-2');
--
-- O ejecutar backfills: 39_backfill_forma_pago_pedidos.sql (seña>=total) y
-- 43_backfill_forma_pago_total_transferencia.sql (entregado/pagado con fecha_pago).
-- ---------------------------------------------------------------------------
