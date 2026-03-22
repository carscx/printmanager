-- ============================================================================
-- 05 — Precios venta, anillado, config_costos (value TEXT), consumo congelado
-- Requiere: 02 (profiles para políticas admin en precios/config_costos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.precios_impresion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('bn', 'color')),
  doble_faz BOOLEAN NOT NULL DEFAULT false,
  precio_venta NUMERIC NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (tipo, doble_faz)
);

CREATE TABLE IF NOT EXISTS public.precios_anillado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medida_mm INTEGER NOT NULL,
  paginas_max INTEGER,
  precio_venta NUMERIC NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (medida_mm)
);

CREATE TABLE IF NOT EXISTS public.config_costos (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.pedido_items_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id UUID NOT NULL REFERENCES public.pedido_items(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES public.insumos(id),
  equipo_id UUID REFERENCES public.equipos(id),
  cantidad NUMERIC NOT NULL,
  costo_unitario_congelado NUMERIC NOT NULL,
  costo_total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.precios_impresion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precios_anillado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items_insumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precios_impresion_select" ON public.precios_impresion;
DROP POLICY IF EXISTS "precios_impresion_all" ON public.precios_impresion;
CREATE POLICY "precios_impresion_select"
  ON public.precios_impresion FOR SELECT TO authenticated USING (true);
CREATE POLICY "precios_impresion_all"
  ON public.precios_impresion FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "precios_anillado_select" ON public.precios_anillado;
DROP POLICY IF EXISTS "precios_anillado_all" ON public.precios_anillado;
CREATE POLICY "precios_anillado_select"
  ON public.precios_anillado FOR SELECT TO authenticated USING (true);
CREATE POLICY "precios_anillado_all"
  ON public.precios_anillado FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "config_costos_select" ON public.config_costos;
DROP POLICY IF EXISTS "config_costos_all" ON public.config_costos;
CREATE POLICY "config_costos_select"
  ON public.config_costos FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_costos_all"
  ON public.config_costos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "pedido_items_insumos_select" ON public.pedido_items_insumos;
DROP POLICY IF EXISTS "pedido_items_insumos_insert" ON public.pedido_items_insumos;
DROP POLICY IF EXISTS "select_pedido_items_insumos" ON public.pedido_items_insumos;
DROP POLICY IF EXISTS "insert_pedido_items_insumos" ON public.pedido_items_insumos;
CREATE POLICY "pedido_items_insumos_select"
  ON public.pedido_items_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "pedido_items_insumos_insert"
  ON public.pedido_items_insumos FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_precios_impresion') THEN
    CREATE TRIGGER set_updated_at_precios_impresion
      BEFORE UPDATE ON public.precios_impresion
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_precios_anillado') THEN
    CREATE TRIGGER set_updated_at_precios_anillado
      BEFORE UPDATE ON public.precios_anillado
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_config_costos') THEN
    CREATE TRIGGER set_updated_at_config_costos
      BEFORE UPDATE ON public.config_costos
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;
