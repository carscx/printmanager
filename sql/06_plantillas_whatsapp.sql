-- ============================================================================
-- 06 — Plantillas WhatsApp (admin y operador editan; todos leen)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plantillas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado_destino TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  incluir_datos_pago BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.plantillas_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_plantillas_whatsapp" ON public.plantillas_whatsapp;
DROP POLICY IF EXISTS "all_plantillas_whatsapp" ON public.plantillas_whatsapp;
CREATE POLICY "select_plantillas_whatsapp"
  ON public.plantillas_whatsapp FOR SELECT TO authenticated USING (true);
CREATE POLICY "all_plantillas_whatsapp"
  ON public.plantillas_whatsapp FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'operador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'operador')
    )
  );
