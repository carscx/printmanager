-- ============================================================================
-- 43 — Backfill: forma_pago_total = 'transferencia' cuando falta el dato
--
-- Contexto: el script 39 solo asigna cobro total cuando seña >= total; pedidos
-- pagados de otra forma (pago único, saldo sin coincidir con seña, etc.)
-- pueden quedar con forma_pago_total NULL aunque ya estén entregados/cobrados.
--
-- Este script asume que, en tu negocio, la gran mayoría de esos casos fueron
-- transferencia. Si hubo efectivo, corregí esas filas a mano después:
--   UPDATE pedidos SET forma_pago_total = 'efectivo' WHERE id = '...';
--
-- Idempotente: solo toca filas con forma_pago_total NULL.
--
-- Requiere: 38 (columnas), recomendable haber ejecutado 39 antes.
-- ============================================================================

-- Vista previa: cuántas filas se actualizarían
SELECT count(*)::bigint AS filas_a_actualizar
FROM public.pedidos p
WHERE p.forma_pago_total IS NULL
  AND COALESCE(NULLIF(p.total_pedido, 0), NULLIF(p.total, 0), 0) > 0
  AND p.fecha_pago IS NOT NULL
  AND LOWER(TRIM(COALESCE(p.estado, ''))) IN ('entregado', 'pagado');

-- Aplicar
UPDATE public.pedidos p
SET forma_pago_total = 'transferencia'
WHERE p.forma_pago_total IS NULL
  AND COALESCE(NULLIF(p.total_pedido, 0), NULLIF(p.total, 0), 0) > 0
  AND p.fecha_pago IS NOT NULL
  AND LOWER(TRIM(COALESCE(p.estado, ''))) IN ('entregado', 'pagado');

-- Verificación: no deberían quedar entregados/pagados con fecha_pago y sin forma
SELECT
  count(*)::bigint AS pendientes_sin_forma
FROM public.pedidos p
WHERE p.forma_pago_total IS NULL
  AND p.fecha_pago IS NOT NULL
  AND LOWER(TRIM(COALESCE(p.estado, ''))) IN ('entregado', 'pagado');
