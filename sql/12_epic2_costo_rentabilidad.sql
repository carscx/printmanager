-- ============================================================================
-- 12 — Épica 2: Costo directo por unidad tarifaria (BOM) y vista de rentabilidad
-- Requiere: 09, 11 (recetas_items, fn_costo_unitario_insumo, fn_hojas_fisicas)
-- ============================================================================

-- Alias (requiere 11: fn_costo_unitario_insumo)
CREATE OR REPLACE FUNCTION public.fn_costo_por_unit_venta(p_insumo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_costo_unitario_insumo(p_insumo_id);
$$;

COMMENT ON FUNCTION public.fn_costo_por_unit_venta(uuid) IS
  'Alias de fn_costo_unitario_insumo: costo lote ÷ equivalencia (hojas, páginas/cartucho).';

-- Costo de insumos para 1 unidad tarifaria de impresión (1 hoja cobrada al cliente):
-- SF = 1 pág PDF; DF = 2 pág PDF = 1 hoja física.
-- Solo líneas IMPRESION con insumo activo (líneas con insumo inactivo no suman; revisar receta).
CREATE OR REPLACE FUNCTION public.fn_costo_directo_unidad_tarifa_impresion(
  p_precio_impresion_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  pi public.precios_impresion%ROWTYPE;
  v_carillas integer;
  v_hojas integer;
  r record;
  v_qty numeric;
  v_cu numeric;
  v_total numeric := 0;
BEGIN
  SELECT * INTO pi FROM public.precios_impresion WHERE id = p_precio_impresion_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_carillas := CASE WHEN pi.doble_faz THEN 2 ELSE 1 END;
  v_hojas := public.fn_hojas_fisicas(v_carillas, pi.doble_faz);

  FOR r IN
    SELECT ri.*
    FROM public.recetas_items ri
    INNER JOIN public.insumos i ON i.id = ri.insumo_id AND i.activo = true
    WHERE ri.alcance = 'IMPRESION'
      AND ri.precio_impresion_id = p_precio_impresion_id
      AND ri.es_espiral_auto = false
  LOOP
    v_qty := r.cantidad::numeric;
    IF r.modo_consumo = 'POR_CARA' THEN
      v_qty := v_qty * v_carillas;
    ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
      v_qty := v_qty * v_hojas;
    END IF;
    v_cu := public.fn_costo_unitario_insumo(r.insumo_id);
    v_total := v_total + v_qty * v_cu;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN round(v_total, 4);
END;
$$;

COMMENT ON FUNCTION public.fn_costo_directo_unidad_tarifa_impresion(uuid) IS
  'Suma receta IMPRESION (insumos activos): POR_CARA×caras de 1 unidad tarifaria, POR_HOJA_FISICA×hojas.';

-- Vista rentabilidad: costo directo = BOM si hay receta; si no, columna precios*.costo_insumo_directo
CREATE OR REPLACE VIEW public.v_rentabilidad_lista_precios AS
WITH lp_base AS (
  SELECT
    lp.id,
    lp.familia,
    lp.codigo,
    lp.descripcion,
    lp.precio_final,
    lp.activo,
    CASE
      WHEN lp.familia = 'impresion' THEN
        COALESCE(
          public.fn_costo_directo_unidad_tarifa_impresion(lp.id),
          lp.costo_insumo_directo
        )
      ELSE lp.costo_insumo_directo
    END AS costo_insumo_directo
  FROM public.lista_precios_publica lp
)
SELECT
  b.id,
  b.familia,
  b.codigo,
  b.descripcion,
  b.precio_final,
  b.activo,
  b.costo_insumo_directo,
  public.fn_costo_total_real_insumos(COALESCE(b.costo_insumo_directo, 0)) AS costo_real,
  CASE
    WHEN b.costo_insumo_directo IS NULL THEN NULL
    WHEN b.precio_final > 0 THEN round(
      (
        (
          b.precio_final
          - public.fn_costo_total_real_insumos(COALESCE(b.costo_insumo_directo, 0))
        )
        / b.precio_final
        * 100
      )::numeric,
      2
    )
    ELSE NULL
  END AS margen_pct,
  cn.margen_objetivo_pct,
  CASE
    WHEN b.costo_insumo_directo IS NULL THEN 'sin_datos'::text
    WHEN b.precio_final <= 0 THEN 'error'::text
    WHEN b.precio_final > 0
      AND (
        (
          b.precio_final
          - public.fn_costo_total_real_insumos(COALESCE(b.costo_insumo_directo, 0))
        )
        / NULLIF(b.precio_final, 0)
        * 100
      ) >= cn.margen_objetivo_pct
      THEN 'verde'::text
    WHEN b.precio_final > 0
      AND (
        (
          b.precio_final
          - public.fn_costo_total_real_insumos(COALESCE(b.costo_insumo_directo, 0))
        )
        / NULLIF(b.precio_final, 0)
        * 100
      ) >= cn.margen_objetivo_pct * 0.5
      THEN 'amarillo'::text
    ELSE 'rojo'::text
  END AS semaforo
FROM lp_base b
CROSS JOIN public.configuracion_negocio cn
WHERE cn.id = 1;

COMMENT ON VIEW public.v_rentabilidad_lista_precios IS
  'Margen % y semáforo; impresión usa fn_costo_directo_unidad_tarifa_impresion (BOM) si hay receta activa.';
