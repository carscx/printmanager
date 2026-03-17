-- =============================================
-- FASE 3A — Catálogo de insumos y control de stock
-- =============================================
-- Ejecutar en Supabase SQL Editor

-- 1. Tabla principal de insumos
CREATE TABLE IF NOT EXISTS insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL CHECK (categoria IN (
    'espiral', 'tapa_transparente', 'tapa_color',
    'papel', 'tinta', 'toner',
    'bolsa', 'bolsa_propileno', 'clip', 'otro'
  )),
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL CHECK (unidad IN (
    'unidad', 'litro', 'resma', 'cartucho', 'paquete'
  )),
  medida_mm INTEGER,
  color TEXT,
  tipo_papel TEXT,
  rendimiento INTEGER,
  hojas_por_unidad INTEGER,
  precio_compra NUMERIC NOT NULL DEFAULT 0,
  stock_actual NUMERIC NOT NULL DEFAULT 0,
  stock_minimo NUMERIC NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 2. Movimientos de stock (auditoría)
CREATE TABLE IF NOT EXISTS stock_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad NUMERIC NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN (
    'compra', 'pedido', 'ajuste_manual', 'devolucion', 'cancelacion'
  )),
  referencia_pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 3. Historial de precios de insumos
CREATE TABLE IF NOT EXISTS insumos_precios_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  precio_anterior NUMERIC NOT NULL,
  precio_nuevo NUMERIC NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id)
);

-- 4. Trigger para updated_at automático en insumos
CREATE OR REPLACE FUNCTION update_insumos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insumos_updated_at ON insumos;
CREATE TRIGGER trg_insumos_updated_at
  BEFORE UPDATE ON insumos
  FOR EACH ROW
  EXECUTE FUNCTION update_insumos_updated_at();

-- 5. Trigger para log automático de cambio de precio
CREATE OR REPLACE FUNCTION log_insumo_precio_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.precio_compra IS DISTINCT FROM NEW.precio_compra THEN
    INSERT INTO insumos_precios_log (insumo_id, precio_anterior, precio_nuevo, changed_by)
    VALUES (NEW.id, OLD.precio_compra, NEW.precio_compra, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insumo_precio_log ON insumos;
CREATE TRIGGER trg_insumo_precio_log
  AFTER UPDATE ON insumos
  FOR EACH ROW
  EXECUTE FUNCTION log_insumo_precio_change();

-- 6. RLS — Todos los usuarios autenticados tienen acceso completo
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos_precios_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumos_all_authenticated" ON insumos;
CREATE POLICY "insumos_all_authenticated" ON insumos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stock_movimientos_all_authenticated" ON stock_movimientos;
CREATE POLICY "stock_movimientos_all_authenticated" ON stock_movimientos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "insumos_precios_log_all_authenticated" ON insumos_precios_log;
CREATE POLICY "insumos_precios_log_all_authenticated" ON insumos_precios_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 7. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_insumos_categoria ON insumos(categoria);
CREATE INDEX IF NOT EXISTS idx_insumos_activo ON insumos(activo);
CREATE INDEX IF NOT EXISTS idx_stock_mov_insumo ON stock_movimientos(insumo_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_fecha ON stock_movimientos(created_at);
CREATE INDEX IF NOT EXISTS idx_precios_log_insumo ON insumos_precios_log(insumo_id);
