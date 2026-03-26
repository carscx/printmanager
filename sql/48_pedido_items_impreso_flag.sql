-- 48 — Flag operativo "impreso" en pedido_items
-- No altera estados del pedido; solo seguimiento de producción.

ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS impreso boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pedido_items.impreso IS
  'Marca operativa por ítem de impresión: true=ya impreso, false=pendiente.';
