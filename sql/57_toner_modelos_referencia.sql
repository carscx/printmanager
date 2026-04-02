-- ============================================================================
-- 57 — Catálogo de referencias de tóner (g/cartucho, mg/cara) + FK en insumos
-- Requiere: insumos (56 recomendado para toner_*)
--
-- Permite elegir un perfil en el ABM de insumos; los valores se copian a
-- toner_gramos_por_cartucho / toner_mg_por_cara. toner_modelo_id conserva la
-- referencia si no se pasa a “personalizado”.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.toner_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE,
  nombre text NOT NULL,
  notas text,
  gramos_por_cartucho numeric NOT NULL CHECK (gramos_por_cartucho > 0 AND gramos_por_cartucho <= 50000),
  mg_por_cara numeric NOT NULL CHECK (mg_por_cara > 0 AND mg_por_cara <= 500000),
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toner_modelos_activo_orden ON public.toner_modelos (activo, orden, nombre);

COMMENT ON TABLE public.toner_modelos IS
  'Perfiles de referencia para tóner laser: gramos por cartucho y mg por cara A4 (cobertura de referencia).';

ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS toner_modelo_id uuid REFERENCES public.toner_modelos (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.insumos.toner_modelo_id IS
  'Opcional: perfil del catálogo toner_modelos usado al guardar (null si personalizado).';

ALTER TABLE public.toner_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "toner_modelos_select_auth" ON public.toner_modelos;
DROP POLICY IF EXISTS "toner_modelos_insert_admin" ON public.toner_modelos;
DROP POLICY IF EXISTS "toner_modelos_update_admin" ON public.toner_modelos;
DROP POLICY IF EXISTS "toner_modelos_delete_admin" ON public.toner_modelos;

CREATE POLICY "toner_modelos_select_auth"
  ON public.toner_modelos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "toner_modelos_insert_admin"
  ON public.toner_modelos FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "toner_modelos_update_admin"
  ON public.toner_modelos FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "toner_modelos_delete_admin"
  ON public.toner_modelos FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

GRANT SELECT ON public.toner_modelos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.toner_modelos TO authenticated;

-- Perfiles iniciales (idempotente por codigo)
INSERT INTO public.toner_modelos (codigo, nombre, notas, gramos_por_cartucho, mg_por_cara, orden, activo)
SELECT 'oficina_mixta', 'Oficina / texto mixto', 'Referencia típica ~5% cobertura; ~1000 pág/cartucho si 60 g.', 60, 60, 10, true
WHERE NOT EXISTS (SELECT 1 FROM public.toner_modelos WHERE codigo = 'oficina_mixta');

INSERT INTO public.toner_modelos (codigo, nombre, notas, gramos_por_cartucho, mg_por_cara, orden, activo)
SELECT 'texto_fino', 'Texto fino / bajo mg', 'Menor depositación por cara; más páginas por cartucho.', 60, 45, 20, true
WHERE NOT EXISTS (SELECT 1 FROM public.toner_modelos WHERE codigo = 'texto_fino');

INSERT INTO public.toner_modelos (codigo, nombre, notas, gramos_por_cartucho, mg_por_cara, orden, activo)
SELECT 'graficos', 'Gráficos / mayor cobertura', 'Más mg por cara; menos páginas por cartucho.', 60, 90, 30, true
WHERE NOT EXISTS (SELECT 1 FROM public.toner_modelos WHERE codigo = 'graficos');

INSERT INTO public.toner_modelos (codigo, nombre, notas, gramos_por_cartucho, mg_por_cara, orden, activo)
SELECT 'cartucho_alto', 'Cartucho alto rendimiento (~80 g)', 'Ej. cartuchos XL; ajustar mg según tu impresora.', 80, 60, 40, true
WHERE NOT EXISTS (SELECT 1 FROM public.toner_modelos WHERE codigo = 'cartucho_alto');
