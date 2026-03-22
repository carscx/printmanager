-- ============================================================================
-- 17 — Comisión 10% solo para rol `vendedor` (admin/operador = 0%)
-- Requiere: 15 (trigger comision, columna comision_pct)
-- ============================================================================

-- Default: 0% salvo que el perfil sea vendedor externo (la app puede fijar 10 al crear vendedor)
ALTER TABLE public.profiles
  ALTER COLUMN comision_pct SET DEFAULT 0;

UPDATE public.profiles
SET comision_pct = 0
WHERE role IS DISTINCT FROM 'vendedor'::public.app_role;

UPDATE public.profiles
SET comision_pct = 10
WHERE role = 'vendedor'::public.app_role
  AND comision_pct = 0;

COMMENT ON COLUMN public.profiles.comision_pct IS
  'Solo aplica a role vendedor (externos). Admin/operador deben permanecer en 0.';

CREATE OR REPLACE FUNCTION public.trg_pedidos_calcular_comision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  pct numeric;
  base numeric;
  v_role public.app_role;
BEGIN
  base := COALESCE(NEW.total_pedido, NEW.total, 0);
  IF NEW.vendedor_id IS NULL THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;

  SELECT pr.role, pr.comision_pct
  INTO v_role, pct
  FROM public.profiles pr
  WHERE pr.id = NEW.vendedor_id;

  IF NOT FOUND THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;

  IF v_role IS DISTINCT FROM 'vendedor'::public.app_role THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;

  pct := COALESCE(pct, 10);
  NEW.comision_monto := ROUND(base * (pct / 100.0), 2);
  RETURN NEW;
END;
$$;

-- Recalcular pedidos existentes
UPDATE public.pedidos p
SET comision_monto = 0
FROM public.profiles pr
WHERE p.vendedor_id = pr.id
  AND pr.role IS DISTINCT FROM 'vendedor'::public.app_role;

UPDATE public.pedidos p
SET comision_monto = ROUND(
  COALESCE(p.total_pedido, p.total, 0) * (COALESCE(pr.comision_pct, 10) / 100.0),
  2
)
FROM public.profiles pr
WHERE p.vendedor_id = pr.id
  AND pr.role = 'vendedor'::public.app_role;
