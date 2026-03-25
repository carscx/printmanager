-- ============================================================================
-- 45 — Gastos fijos mensuales + RLS (solo admin escribe; lectura autenticados)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.categoria_gasto_fijo AS ENUM (
    'impuestos',
    'servicios',
    'amortizacion',
    'sueldo_personal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto text NOT NULL,
  monto numeric NOT NULL CHECK (monto >= 0),
  categoria public.categoria_gasto_fijo NOT NULL,
  dia_vencimiento smallint CHECK (
    dia_vencimiento IS NULL OR (dia_vencimiento >= 1 AND dia_vencimiento <= 28)
  ),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_fijos_activo ON public.gastos_fijos (activo);

COMMENT ON TABLE public.gastos_fijos IS
  'Gastos fijos mensuales (Monotributo, servicios, amortización, sueldos).';

ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gastos_fijos_select_auth" ON public.gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_insert_admin" ON public.gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_update_admin" ON public.gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_delete_admin" ON public.gastos_fijos;

CREATE POLICY "gastos_fijos_select_auth"
  ON public.gastos_fijos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "gastos_fijos_insert_admin"
  ON public.gastos_fijos FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "gastos_fijos_update_admin"
  ON public.gastos_fijos FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "gastos_fijos_delete_admin"
  ON public.gastos_fijos FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- Datos de ejemplo (idempotente por concepto)
INSERT INTO public.gastos_fijos (concepto, monto, categoria, dia_vencimiento, activo)
SELECT 'Monotributo', 4780, 'impuestos'::public.categoria_gasto_fijo, 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.gastos_fijos WHERE concepto = 'Monotributo'
);

INSERT INTO public.gastos_fijos (concepto, monto, categoria, dia_vencimiento, activo)
SELECT 'Internet / Luz', 15000, 'servicios'::public.categoria_gasto_fijo, 10, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.gastos_fijos WHERE concepto = 'Internet / Luz'
);

INSERT INTO public.gastos_fijos (concepto, monto, categoria, dia_vencimiento, activo)
SELECT 'Amortización máquinas', 50000, 'amortizacion'::public.categoria_gasto_fijo, 1, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.gastos_fijos WHERE concepto = 'Amortización máquinas'
);
