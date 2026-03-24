-- 41 — Backfill: asegurar facturado = false en filas heredadas (si alguna quedó NULL)
UPDATE public.pedidos
SET facturado = false
WHERE facturado IS NULL;
