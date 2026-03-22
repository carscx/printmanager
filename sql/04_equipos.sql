-- ============================================================================
-- 04 — Equipos (impresoras) para motor de costos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('inkjet', 'laser')),
  costo_adquisicion NUMERIC NOT NULL DEFAULT 0,
  fecha_adquisicion DATE,
  vida_util_meses INTEGER NOT NULL DEFAULT 36,
  costo_mantenimiento_mensual NUMERIC NOT NULL DEFAULT 0,
  paginas_mes_estimadas INTEGER NOT NULL DEFAULT 3000,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_equipos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_equipos_updated_at ON public.equipos;
CREATE TRIGGER trigger_equipos_updated_at
  BEFORE UPDATE ON public.equipos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_equipos_updated_at();

ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipos_select_auth" ON public.equipos;
DROP POLICY IF EXISTS "equipos_insert_auth" ON public.equipos;
DROP POLICY IF EXISTS "equipos_update_auth" ON public.equipos;
DROP POLICY IF EXISTS "equipos_delete_auth" ON public.equipos;

CREATE POLICY "equipos_select_auth" ON public.equipos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_insert_auth" ON public.equipos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "equipos_update_auth" ON public.equipos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "equipos_delete_auth" ON public.equipos
  FOR DELETE TO authenticated USING (true);
