-- 39 — Backfill de forma_pago_sena / forma_pago_total en pedidos existentes
-- Ejecutar DESPUÉS de 38_forma_pago_pedidos.sql (columnas ya creadas).
--
-- Criterios (alineados con la app):
--   forma_pago_sena: transferencia si hubo seña como depósito (tipo sena_50 / sena_libre,
--   o sena > 0 y sena < total del pedido). No toca filas ya rellenadas.
--   forma_pago_total: transferencia por defecto en pedidos ya pagados al total (pagado /
--   entregado / listo con sena >= total). El dato histórico real no existía: conviene
--   revisar en negocio si querés marcar algunos como efectivo a mano.
--
-- Idempotente: volver a ejecutar no cambia filas ya con valor.

-- Total efectivo del pedido (total_pedido tiene prioridad si es > 0)
-- ---------------------------------------------------------------------------

-- 1) Seña = transferencia (depósito parcial o tipo explícito)
UPDATE public.pedidos p
SET forma_pago_sena = 'transferencia'
WHERE p.forma_pago_sena IS NULL
  AND COALESCE(p.sena, 0) > 0
  AND (
    LOWER(TRIM(COALESCE(p.tipo_pago, ''))) IN ('sena_50', 'sena_libre')
    OR COALESCE(p.sena, 0)
       < COALESCE(NULLIF(p.total_pedido, 0), NULLIF(p.total, 0), 0)
  );

-- 2) Cobro total ya registrado en BD (sin modal histórico): valor por defecto
UPDATE public.pedidos p
SET forma_pago_total = 'transferencia'
WHERE p.forma_pago_total IS NULL
  AND COALESCE(NULLIF(p.total_pedido, 0), NULLIF(p.total, 0), 0) > 0
  AND COALESCE(p.sena, 0)
      >= COALESCE(NULLIF(p.total_pedido, 0), NULLIF(p.total, 0), 0)
  AND LOWER(TRIM(COALESCE(p.estado, ''))) IN ('pagado', 'entregado', 'listo');

-- Verificación manual (opcional):
-- SELECT id, cliente, estado, sena, total, total_pedido, tipo_pago, forma_pago_sena, forma_pago_total
-- FROM public.pedidos
-- ORDER BY created_at DESC
-- LIMIT 50;
