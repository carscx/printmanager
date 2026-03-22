-- ============================================================================
-- 03 — Insumos, movimientos de stock, log de precios
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insumos (
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

CREATE TABLE IF NOT EXISTS public.stock_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad NUMERIC NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN (
    'compra', 'pedido', 'ajuste_manual', 'devolucion', 'cancelacion'
  )),
  referencia_pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.insumos_precios_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  precio_anterior NUMERIC NOT NULL,
  precio_nuevo NUMERIC NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id)
);

CREATE OR REPLACE FUNCTION public.update_insumos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insumos_updated_at ON public.insumos;
CREATE TRIGGER trg_insumos_updated_at
  BEFORE UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_insumos_updated_at();

CREATE OR REPLACE FUNCTION public.log_insumo_precio_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.precio_compra IS DISTINCT FROM NEW.precio_compra THEN
    INSERT INTO public.insumos_precios_log (insumo_id, precio_anterior, precio_nuevo, changed_by)
    VALUES (NEW.id, OLD.precio_compra, NEW.precio_compra, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insumo_precio_log ON public.insumos;
CREATE TRIGGER trg_insumo_precio_log
  AFTER UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.log_insumo_precio_change();

ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_precios_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumos_all_authenticated" ON public.insumos;
CREATE POLICY "insumos_all_authenticated" ON public.insumos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stock_movimientos_all_authenticated" ON public.stock_movimientos;
CREATE POLICY "stock_movimientos_all_authenticated" ON public.stock_movimientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "insumos_precios_log_all_authenticated" ON public.insumos_precios_log;
CREATE POLICY "insumos_precios_log_all_authenticated" ON public.insumos_precios_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_insumos_categoria ON public.insumos(categoria);
CREATE INDEX IF NOT EXISTS idx_insumos_activo ON public.insumos(activo);
