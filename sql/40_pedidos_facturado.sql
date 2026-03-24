-- 40 — Marca de pedidos ya incluidos en exportación de facturación (ARCA / monotributo)
-- Ejecutar en Supabase después del esquema base.

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS facturado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pedidos.facturado IS 'True si ya se exportó en Facturación y se marcó como facturado.';

CREATE INDEX IF NOT EXISTS idx_pedidos_facturacion_arca
  ON public.pedidos (facturado, estado)
  WHERE facturado = false AND lower(trim(estado)) = 'entregado';
