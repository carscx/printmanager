-- ============================================================================
-- 09 — Épica 1: Motor de costos, rentabilidad, lista pública, configuración negocio
-- Requiere: 03 (insumos), 05 (precios_impresion, precios_anillado)
-- ============================================================================

-- ── 1) Extensión insumos: costo base y equivalencia de unidad de venta ─────
ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS costo_base NUMERIC,
  ADD COLUMN IF NOT EXISTS unidad_medida TEXT,
  ADD COLUMN IF NOT EXISTS unidad_venta_equivalente NUMERIC NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.insumos.costo_base IS
  'Costo del lote de compra (ej. precio de la resma). Si NULL, se usa precio_compra.';
COMMENT ON COLUMN public.insumos.unidad_medida IS
  'Etiqueta de unidad de compra (ej. resma, cartucho); alinea con unidad legacy.';
COMMENT ON COLUMN public.insumos.unidad_venta_equivalente IS
  'Cuántas unidades de consumo/venta entran en costo_base (ej. 500 hojas por resma).';

UPDATE public.insumos
SET
  costo_base = COALESCE(costo_base, precio_compra),
  unidad_medida = COALESCE(unidad_medida, unidad::text),
  unidad_venta_equivalente = CASE
    WHEN unidad_venta_equivalente IS NOT NULL AND unidad_venta_equivalente > 0
      THEN unidad_venta_equivalente
    WHEN categoria = 'papel' AND COALESCE(hojas_por_unidad, 0) > 0 THEN hojas_por_unidad::numeric
    WHEN COALESCE(rendimiento, 0) > 0 THEN rendimiento::numeric
    ELSE 1
  END
WHERE true;

-- Mantener costo_base alineado con precio_compra si solo cambia uno (opcional)
CREATE OR REPLACE FUNCTION public.trg_insumos_sync_costo_base()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.costo_base IS NULL AND NEW.precio_compra IS NOT NULL THEN
    NEW.costo_base := NEW.precio_compra;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.precio_compra IS DISTINCT FROM OLD.precio_compra
      AND NEW.costo_base IS NOT DISTINCT FROM OLD.costo_base THEN
      NEW.costo_base := NEW.precio_compra;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insumos_sync_costo_base ON public.insumos;
CREATE TRIGGER trg_insumos_sync_costo_base
  BEFORE INSERT OR UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_insumos_sync_costo_base();

-- costo_base ÷ unidad_venta_equivalente (el script 11 redefine fn_costo_unitario_insumo y alias).
CREATE OR REPLACE FUNCTION public.fn_costo_por_unidad_venta(p_insumo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(i.unidad_venta_equivalente, 0) > 0
      THEN COALESCE(i.costo_base, i.precio_compra, 0) / i.unidad_venta_equivalente
    ELSE 0::numeric
  END
  FROM public.insumos i
  WHERE i.id = p_insumo_id;
$$;

-- ── 2) Configuración de negocio (single row id = 1) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracion_negocio (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pct_desperdicio numeric NOT NULL DEFAULT 5,
  pct_mantenimiento_maquinas numeric NOT NULL DEFAULT 10,
  dias_vigencia_presupuesto integer NOT NULL DEFAULT 7,
  margen_objetivo_pct numeric NOT NULL DEFAULT 40,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT chk_pct_desperdicio CHECK (pct_desperdicio >= 0 AND pct_desperdicio <= 100),
  CONSTRAINT chk_pct_mant CHECK (pct_mantenimiento_maquinas >= 0 AND pct_mantenimiento_maquinas <= 100),
  CONSTRAINT chk_dias CHECK (dias_vigencia_presupuesto >= 1 AND dias_vigencia_presupuesto <= 365),
  CONSTRAINT chk_margen_obj CHECK (margen_objetivo_pct >= 0 AND margen_objetivo_pct <= 100)
);

INSERT INTO public.configuracion_negocio (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_negocio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracion_negocio_all" ON public.configuracion_negocio;
CREATE POLICY "configuracion_negocio_all"
  ON public.configuracion_negocio FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_configuracion_negocio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_configuracion_negocio_updated ON public.configuracion_negocio;
CREATE TRIGGER trg_configuracion_negocio_updated
  BEFORE UPDATE ON public.configuracion_negocio
  FOR EACH ROW
  EXECUTE FUNCTION public.set_configuracion_negocio_updated_at();

-- ── 3) Costo real con factores (Épica 1) ────────────────────────────────────
-- CostoTotal = CostoInsumos * (1 + %desperdicio/100) * (1 + %mantenimiento/100)
CREATE OR REPLACE FUNCTION public.fn_costo_total_real_insumos(costo_insumos numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d numeric;
  m numeric;
BEGIN
  SELECT
    COALESCE(cn.pct_desperdicio, 5),
    COALESCE(cn.pct_mantenimiento_maquinas, 10)
  INTO d, m
  FROM public.configuracion_negocio cn
  WHERE cn.id = 1;

  IF costo_insumos IS NULL OR costo_insumos < 0 THEN
    RETURN 0;
  END IF;
  RETURN round(
    costo_insumos * (1 + d / 100.0) * (1 + m / 100.0),
    4
  );
END;
$$;

COMMENT ON FUNCTION public.fn_costo_total_real_insumos(numeric) IS
  'CostoTotal = CostoInsumos × (1+desperdicio) × (1+mantenimiento).';

-- ── 4) Precios: costo directo estimado por línea (para margen en SQL) ─────
ALTER TABLE public.precios_impresion
  ADD COLUMN IF NOT EXISTS costo_insumo_directo numeric;

ALTER TABLE public.precios_anillado
  ADD COLUMN IF NOT EXISTS costo_insumo_directo numeric;

COMMENT ON COLUMN public.precios_impresion.costo_insumo_directo IS
  'Costo variable de insumos por unidad tarifaria (hoja), antes de factores desperdicio/mantenimiento.';
COMMENT ON COLUMN public.precios_anillado.costo_insumo_directo IS
  'Costo variable de insumos por trabajo de anillado, antes de factores.';

-- ── 5) Vista lista de precios públicos (operador / SSOT lectura) ───────────
CREATE OR REPLACE VIEW public.lista_precios_publica AS
SELECT
  pi.id,
  'impresion'::text AS familia,
  (pi.tipo || '_' || CASE WHEN pi.doble_faz THEN 'df' ELSE 'sf' END) AS codigo,
  trim(
    upper(pi.tipo) || ' ' ||
    CASE WHEN pi.doble_faz THEN 'doble faz' ELSE 'simple faz' END
  ) AS descripcion,
  pi.precio_venta AS precio_final,
  pi.activo,
  pi.costo_insumo_directo,
  pi.updated_at
FROM public.precios_impresion pi
UNION ALL
SELECT
  pa.id,
  'anillado'::text,
  ('ani_' || pa.medida_mm::text),
  ('Anillado ' || pa.medida_mm::text || ' mm'),
  pa.precio_venta,
  pa.activo,
  pa.costo_insumo_directo,
  pa.updated_at
FROM public.precios_anillado pa;

COMMENT ON VIEW public.lista_precios_publica IS
  'Catálogo unificado de precios de venta; referencia para UI operador.';

-- ── 6) Rentabilidad + semáforo (vs margen objetivo) ─────────────────────────
CREATE OR REPLACE VIEW public.v_rentabilidad_lista_precios AS
SELECT
  lp.id,
  lp.familia,
  lp.codigo,
  lp.descripcion,
  lp.precio_final,
  lp.activo,
  lp.costo_insumo_directo,
  public.fn_costo_total_real_insumos(COALESCE(lp.costo_insumo_directo, 0)) AS costo_real,
  CASE
    WHEN lp.costo_insumo_directo IS NULL THEN NULL
    WHEN lp.precio_final > 0 THEN round(
      (
        (lp.precio_final - public.fn_costo_total_real_insumos(lp.costo_insumo_directo))
        / lp.precio_final
        * 100
      )::numeric,
      2
    )
    ELSE NULL
  END AS margen_pct,
  cn.margen_objetivo_pct,
  CASE
    WHEN lp.costo_insumo_directo IS NULL THEN 'sin_datos'::text
    WHEN lp.precio_final <= 0 THEN 'error'::text
    WHEN lp.precio_final > 0
      AND (
        (lp.precio_final - public.fn_costo_total_real_insumos(lp.costo_insumo_directo))
        / NULLIF(lp.precio_final, 0)
        * 100
      ) >= cn.margen_objetivo_pct
      THEN 'verde'::text
    WHEN lp.precio_final > 0
      AND (
        (lp.precio_final - public.fn_costo_total_real_insumos(lp.costo_insumo_directo))
        / NULLIF(lp.precio_final, 0)
        * 100
      ) >= cn.margen_objetivo_pct * 0.5
      THEN 'amarillo'::text
    ELSE 'rojo'::text
  END AS semaforo
FROM public.lista_precios_publica lp
CROSS JOIN public.configuracion_negocio cn
WHERE cn.id = 1;

COMMENT ON VIEW public.v_rentabilidad_lista_precios IS
  'Margen % y semáforo (verde/amarillo/rojo) vs margen_objetivo en configuracion_negocio.';

GRANT SELECT ON public.lista_precios_publica TO authenticated;
GRANT SELECT ON public.v_rentabilidad_lista_precios TO authenticated;
