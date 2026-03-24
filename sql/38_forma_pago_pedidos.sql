-- 38 — Forma de pago: seña (siempre transferencia si hay seña) y cobro total (efectivo / transferencia)
-- Ejecutar en Supabase SQL Editor o psql tras el esquema base.

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS forma_pago_sena TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS forma_pago_total TEXT;

COMMENT ON COLUMN public.pedidos.forma_pago_sena IS 'Si hay seña: siempre transferencia (regla de negocio).';
COMMENT ON COLUMN public.pedidos.forma_pago_total IS 'efectivo | transferencia al cobrar el saldo total (modal Cobrar total).';
