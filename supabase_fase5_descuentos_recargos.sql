-- FASE 5: Descuentos y Recargos
-- Agregar campos de recargo y descuento a pedido_items y pedidos

-- 1. Campos en pedido_items
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS descuento_porcentaje NUMERIC,
  ADD COLUMN IF NOT EXISTS descuento_monto NUMERIC,
  ADD COLUMN IF NOT EXISTS recargo_porcentaje NUMERIC,
  ADD COLUMN IF NOT EXISTS recargo_monto NUMERIC;

-- 2. Campos en pedidos (globales)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS descuento_global_porcentaje NUMERIC,
  ADD COLUMN IF NOT EXISTS recargo_global_porcentaje NUMERIC;

-- NOTA: Si ya existen los campos de descuento, solo se agregan los de recargo.
-- Ejecutar este script en Supabase SQL editor o psql.
