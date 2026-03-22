-- ============================================================================
-- 15 — Épica 4: comisiones por vendedor, ranking, rentabilidad neta real
-- Requiere: 02 (profiles, app_role), 14 (v_estadisticas_diarias)
-- Elimina columnas legacy sobrina_trabajo.
-- ============================================================================

-- Rol adicional para quienes venden (además de operador)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'vendedor'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'vendedor';
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS comision_pct NUMERIC NOT NULL DEFAULT 10
    CHECK (comision_pct >= 0 AND comision_pct <= 100);

COMMENT ON COLUMN public.profiles.comision_pct IS
  'Porcentaje de comisión sobre la venta del pedido (default 10).';

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comision_monto NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pedidos.vendedor_id IS 'Vendedor asignado (operador o vendedor).';
COMMENT ON COLUMN public.pedidos.comision_monto IS 'Comisión calculada: base venta × comision_pct del vendedor.';

CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor_id ON public.pedidos (vendedor_id);

ALTER TABLE public.pedidos DROP COLUMN IF EXISTS sobrina_trabajo;
ALTER TABLE public.pedido_items DROP COLUMN IF EXISTS sobrina_trabajo;

-- Recalcular comisión en INSERT/UPDATE (base = total_pedido o total)
CREATE OR REPLACE FUNCTION public.trg_pedidos_calcular_comision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  pct numeric;
  base numeric;
BEGIN
  base := COALESCE(NEW.total_pedido, NEW.total, 0);
  IF NEW.vendedor_id IS NULL THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;
  SELECT COALESCE(pr.comision_pct, 10) INTO pct
  FROM public.profiles pr
  WHERE pr.id = NEW.vendedor_id;
  IF NOT FOUND THEN
    pct := 10;
  END IF;
  NEW.comision_monto := ROUND(base * (pct / 100.0), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_comision ON public.pedidos;
CREATE TRIGGER trg_pedidos_comision
  BEFORE INSERT OR UPDATE OF total, total_pedido, vendedor_id ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pedidos_calcular_comision();

-- Backfill comisiones en pedidos existentes con vendedor (si se asigna después a mano)
UPDATE public.pedidos p
SET comision_monto = ROUND(
  COALESCE(p.total_pedido, p.total, 0) * (COALESCE(pr.comision_pct, 10) / 100.0),
  2
)
FROM public.profiles pr
WHERE p.vendedor_id = pr.id
  AND p.vendedor_id IS NOT NULL;

-- ── Vista diaria: ganancia neta = venta − insumos − comisión ─────────────────
-- REPLACE no puede cambiar nombres/orden de columnas; hay que dropear antes (14 → 15).
DROP VIEW IF EXISTS public.v_estadisticas_diarias CASCADE;

CREATE VIEW public.v_estadisticas_diarias AS
WITH base AS (
  SELECT
    p.id AS pedido_id,
    (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
    COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
  FROM public.pedidos p
  WHERE p.estado IN ('señado', 'pagado', 'listo', 'entregado')
),
venta_items AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
  FROM public.pedido_items pi
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
costos AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pii.costo_total, 0))::numeric AS costo_insumos
  FROM public.pedido_items pi
  INNER JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
por_pedido AS (
  SELECT
    b.dia,
    b.pedido_id,
    CASE
      WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
      ELSE COALESCE(b.total_cabecera, 0)
    END AS venta,
    COALESCE(c.costo_insumos, 0)::numeric AS costo,
    COALESCE(p.comision_monto, 0)::numeric AS comision
  FROM base b
  LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
  LEFT JOIN costos c ON c.pedido_id = b.pedido_id
  INNER JOIN public.pedidos p ON p.id = b.pedido_id
)
SELECT
  dia,
  SUM(venta)::numeric AS total_ingresos,
  SUM(costo)::numeric AS total_insumos,
  SUM(comision)::numeric AS total_comisiones,
  (SUM(venta) - SUM(costo) - SUM(comision))::numeric AS ganancia_neta,
  CASE
    WHEN SUM(venta) > 0 THEN
      ROUND(
        ((SUM(venta) - SUM(costo) - SUM(comision)) / NULLIF(SUM(venta), 0) * 100)::numeric,
        2
      )
    ELSE 0::numeric
  END AS pct_margen_real
FROM por_pedido
GROUP BY dia;

COMMENT ON VIEW public.v_estadisticas_diarias IS
  'Por día (AR): total_ingresos, total_insumos (BOM), total_comisiones, ganancia_neta; pedidos señado/pagado/listo/entregado.';

GRANT SELECT ON public.v_estadisticas_diarias TO authenticated;

-- ── Ranking de vendedores en rango de fechas ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_dashboard_ranking_vendedores(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  vendedor_id uuid,
  nombre text,
  ventas_totales numeric,
  comision_acumulada numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      p.id AS pedido_id,
      p.vendedor_id,
      (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
      COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
    FROM public.pedidos p
    WHERE p.estado IN ('señado', 'pagado', 'listo', 'entregado')
      AND p.vendedor_id IS NOT NULL
      AND (timezone('America/Argentina/Buenos_Aires', p.created_at))::date
        BETWEEN p_desde AND p_hasta
  ),
  venta_items AS (
    SELECT
      pi.pedido_id,
      SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
    FROM public.pedido_items pi
    INNER JOIN base b ON b.pedido_id = pi.pedido_id
    GROUP BY pi.pedido_id
  ),
  por_pedido AS (
    SELECT
      b.vendedor_id,
      CASE
        WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
        ELSE COALESCE(b.total_cabecera, 0)
      END AS venta,
      COALESCE(p.comision_monto, 0)::numeric AS comision
    FROM base b
    LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
    INNER JOIN public.pedidos p ON p.id = b.pedido_id
  )
  SELECT
    pp.vendedor_id,
    COALESCE(NULLIF(TRIM(pr.full_name), ''), pr.id::text)::text AS nombre,
    SUM(pp.venta)::numeric AS ventas_totales,
    SUM(pp.comision)::numeric AS comision_acumulada
  FROM por_pedido pp
  INNER JOIN public.profiles pr ON pr.id = pp.vendedor_id
  GROUP BY pp.vendedor_id, pr.id, pr.full_name
  ORDER BY SUM(pp.venta) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.fn_dashboard_ranking_vendedores(date, date) IS
  'Ventas y comisiones acumuladas por vendedor en rango (pedidos señado/listo/entregado).';

GRANT EXECUTE ON FUNCTION public.fn_dashboard_ranking_vendedores(date, date) TO authenticated;
