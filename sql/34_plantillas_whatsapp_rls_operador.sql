-- 34 — RLS: operador puede CRUD en plantillas_whatsapp (igual que admin)
-- Requiere: 06 (tabla + políticas previas). Idempotente.
-- Ejecutar en Supabase SQL Editor si la política actual solo permitía admin.

DROP POLICY IF EXISTS "all_plantillas_whatsapp" ON public.plantillas_whatsapp;

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
