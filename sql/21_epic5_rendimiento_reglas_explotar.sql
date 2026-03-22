-- ============================================================================
-- 21 — Épica 5: rendimiento maestro (costo_compra / rendimiento), +10% en reglas,
--     explosión BOM priorizando reglas_costo (páginas × copias × cantidad).
-- Requiere: 20 (reglas_costo, fn_costo_directo, rpc_delete…)
-- ============================================================================

-- ── 1) Backfill rendimiento (maestros por categoría) ─────────────────────────
UPDATE public.insumos i
SET rendimiento = CASE i.categoria
  WHEN 'toner' THEN COALESCE(NULLIF(i.rendimiento, 0), 1800)
  WHEN 'tinta' THEN COALESCE(NULLIF(i.rendimiento, 0), 30000)
  WHEN 'papel' THEN COALESCE(NULLIF(i.rendimiento, 0), NULLIF(i.hojas_por_unidad, 0), 500)
  ELSE COALESCE(
    NULLIF(i.rendimiento, 0),
    CASE
      WHEN COALESCE(i.unidad_venta_equivalente, 0) > 0 THEN
        GREATEST(1, CEIL(i.unidad_venta_equivalente)::integer)
      WHEN COALESCE(i.unidades_por_compra, 0) > 0 THEN
        GREATEST(1, CEIL(i.unidades_por_compra)::integer)
      ELSE 1
    END
  )
END;

COMMENT ON COLUMN public.insumos.rendimiento IS
  'Unidades de consumo por lote de compra (hojas/ml-equivalente); costo unitario = costo_compra / rendimiento.';

-- ── 2) Costo unitario: prioridad rendimiento ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_costo_unitario_insumo(p_insumo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p_insumo_id IS NULL THEN 0::numeric
        WHEN COALESCE(i.rendimiento, 0) > 0 THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / NULLIF(i.rendimiento::numeric, 0)
        WHEN GREATEST(
          COALESCE(i.unidad_venta_equivalente, 0),
          COALESCE(i.unidades_por_compra, 0)
        ) > 0 THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / GREATEST(
            NULLIF(COALESCE(i.unidad_venta_equivalente, i.unidades_por_compra), 0),
            1
          )
        ELSE 0::numeric
      END
      FROM public.insumos i
      WHERE i.id = p_insumo_id AND COALESCE(i.activo, true)
    ),
    0::numeric
  );
$$;

-- ── 3) Reglas de negocio: +10% desperdicio/seguridad sobre la suma base ──────
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
  v_reglas numeric;
  v_tiene_reglas boolean;
  v_factor_seguridad constant numeric := 1.10;
BEGIN
  SELECT * INTO pi FROM public.precios_impresion WHERE id = p_precio_impresion_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reglas_costo rc
    WHERE rc.precio_impresion_id = p_precio_impresion_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL
  ) INTO v_tiene_reglas;

  IF v_tiene_reglas THEN
    SELECT COALESCE(SUM(
      public.fn_costo_unitario_insumo(rc.insumo_id) * rc.cantidad_usada
    ), 0) INTO v_reglas
    FROM public.reglas_costo rc
    WHERE rc.precio_impresion_id = p_precio_impresion_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL;

    IF v_reglas > 0 THEN
      RETURN round(v_reglas * v_factor_seguridad, 4);
    END IF;
    RETURN NULL;
  END IF;

  v_carillas := CASE WHEN pi.doble_faz THEN 2 ELSE 1 END;
  v_hojas := public.fn_hojas_fisicas(v_carillas, pi.doble_faz);

  FOR r IN
    SELECT ri.*
    FROM public.recetas_items ri
    WHERE ri.alcance = 'IMPRESION'
      AND ri.precio_impresion_id = p_precio_impresion_id
      AND ri.es_espiral_auto = false
  LOOP
    v_cu := 0;
    IF r.insumo_id IS NOT NULL THEN
      v_cu := public.fn_costo_unitario_insumo(r.insumo_id);
    END IF;

    v_qty := r.cantidad::numeric;
    IF r.modo_consumo = 'POR_CARA' THEN
      v_qty := v_qty * v_carillas;
    ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
      v_qty := v_qty * v_hojas;
    END IF;
    v_total := v_total + v_qty * v_cu;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN round(v_total, 4);
END;
$$;

-- Refrescar tarifas si cambia rendimiento
DROP TRIGGER IF EXISTS trg_insumos_refresh_tarifas_costo ON public.insumos;
CREATE OR REPLACE FUNCTION public.trg_insumos_refresh_tarifas_costo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.costo_compra IS DISTINCT FROM NEW.costo_compra OR
    OLD.unidades_por_compra IS DISTINCT FROM NEW.unidades_por_compra OR
    OLD.rendimiento IS DISTINCT FROM NEW.rendimiento OR
    OLD.costo_base IS DISTINCT FROM NEW.costo_base OR
    OLD.precio_compra IS DISTINCT FROM NEW.precio_compra OR
    OLD.unidad_venta_equivalente IS DISTINCT FROM NEW.unidad_venta_equivalente
  ) THEN
    FOR pid IN
      SELECT DISTINCT rc.precio_impresion_id
      FROM public.reglas_costo rc
      WHERE rc.insumo_id = NEW.id
    LOOP
      UPDATE public.precios_impresion p
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
      WHERE p.id = pid;
    END LOOP;

    FOR pid IN
      SELECT DISTINCT ri.precio_impresion_id
      FROM public.recetas_items ri
      WHERE ri.insumo_id = NEW.id AND ri.alcance = 'IMPRESION' AND ri.precio_impresion_id IS NOT NULL
    LOOP
      UPDATE public.precios_impresion p
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
      WHERE p.id = pid;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_insumos_refresh_tarifas_costo
  AFTER UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_insumos_refresh_tarifas_costo();

-- ── 4) Explosión: prioridad reglas_costo (misma escala que POR_CARA en receta) ─
-- DROP obligatorio: PG no permite renombrar parámetros (ej. pedido_id → p_pedido_id) con CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.rpc_explotar_bom_pedido(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_explotar_bom_pedido(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
  r record;
  v_carillas integer;
  v_hojas integer;
  v_copias numeric;
  v_bn boolean;
  v_df boolean;
  v_solo boolean;
  v_anillado_mm integer;
  v_pid_imp uuid;
  v_qty numeric;
  v_costo_u numeric;
  v_sid uuid;
  v_tapa_f uuid;
  v_tapa_d uuid;
  v_cn public.configuracion_negocio%ROWTYPE;
  v_cnt_imp integer;
  v_cnt_an integer;
  v_cnt_reg integer;
BEGIN
  SELECT * INTO v_cn FROM public.configuracion_negocio WHERE id = 1;
  v_tapa_f := v_cn.insumo_tapa_frontal_id;
  v_tapa_d := v_cn.insumo_tapa_dorsal_id;

  DELETE FROM public.pedido_items_insumos pii
  USING public.pedido_items pi
  WHERE pii.pedido_item_id = pi.id AND pi.pedido_id = p_pedido_id;

  FOR it IN
    SELECT * FROM public.pedido_items WHERE pedido_id = p_pedido_id
  LOOP
    v_copias := GREATEST(COALESCE(it.copias, 1), 1)::numeric;
    v_solo := COALESCE(it.solo_anillado, false);
    v_df := COALESCE(it.doble_faz, false);
    v_bn := it.tipo_impresion IS NULL OR (it.tipo_impresion NOT ILIKE '%COLOR%');
    v_anillado_mm := it.anillado_medida_mm;
    IF v_anillado_mm IS NULL AND it.anillado IS NOT NULL THEN
      SELECT (regexp_match(it.anillado, '(\d+)'))[1]::integer INTO v_anillado_mm;
    END IF;

    v_carillas := GREATEST(COALESCE(it.paginas, 0), 0);
    v_hojas := public.fn_hojas_fisicas(it.paginas, v_df);

    v_pid_imp := it.precio_impresion_id;
    IF v_pid_imp IS NULL AND NOT v_solo THEN
      SELECT pi2.id INTO v_pid_imp
      FROM public.precios_impresion pi2
      WHERE pi2.tipo = CASE WHEN v_bn THEN 'bn' ELSE 'color' END
        AND pi2.doble_faz = v_df
        AND pi2.activo
      LIMIT 1;
    END IF;

    -- Impresión: reglas_costo (páginas × copias × cantidad) o recetas BOM
    IF NOT v_solo AND v_carillas > 0 AND v_pid_imp IS NOT NULL THEN
      SELECT count(*) INTO v_cnt_reg
      FROM public.reglas_costo
      WHERE precio_impresion_id = v_pid_imp
        AND activo
        AND insumo_id IS NOT NULL;

      IF v_cnt_reg > 0 THEN
        FOR r IN
          SELECT * FROM public.reglas_costo
          WHERE precio_impresion_id = v_pid_imp
            AND activo
            AND insumo_id IS NOT NULL
        LOOP
          v_qty := r.cantidad_usada::numeric * v_carillas * v_copias;
          v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
          );
        END LOOP;
      ELSE
        SELECT count(*) INTO v_cnt_imp
        FROM public.recetas_items
        WHERE alcance = 'IMPRESION' AND precio_impresion_id = v_pid_imp;
        IF v_cnt_imp = 0 THEN
          RAISE EXCEPTION 'RECETA_INCOMPLETA: sin BOM ni reglas para precio_impresion_id=%', v_pid_imp;
        END IF;

        FOR r IN
          SELECT * FROM public.recetas_items
          WHERE alcance = 'IMPRESION' AND precio_impresion_id = v_pid_imp
        LOOP
          v_qty := r.cantidad::numeric;
          IF r.modo_consumo = 'POR_CARA' THEN
            v_qty := v_qty * v_carillas * v_copias;
          ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
            v_qty := v_qty * v_hojas * v_copias;
          ELSE
            v_qty := v_qty * v_copias;
          END IF;
          v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
          );
        END LOOP;
      END IF;
    ELSIF NOT v_solo AND v_carillas > 0 AND v_pid_imp IS NULL THEN
      RAISE EXCEPTION 'RECETA_INCOMPLETA: falta precio_impresion_id en ítem';
    END IF;

    IF v_solo THEN
      IF v_carillas < 1 THEN
        RAISE EXCEPTION 'SOLO_ANILLADO_SIN_HOJAS: indicá cantidad de hojas para el espiral';
      END IF;
      SELECT count(*) INTO v_cnt_an FROM public.recetas_items
      WHERE alcance = 'SOLO_ANILLADO';
      IF v_cnt_an > 0 THEN
        FOR r IN
          SELECT * FROM public.recetas_items WHERE alcance = 'SOLO_ANILLADO'
        LOOP
          v_qty := r.cantidad::numeric;
          IF r.modo_consumo = 'POR_CARA' THEN
            v_qty := v_qty * v_carillas * v_copias;
          ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
            v_qty := v_qty * v_hojas * v_copias;
          ELSE
            v_qty := v_qty * v_copias;
          END IF;
          IF r.es_espiral_auto THEN
            v_sid := public.fn_resolver_insumo_espiral_por_hojas(
              GREATEST(v_hojas, 1)
            );
            v_costo_u := public.fn_costo_unitario_insumo(v_sid);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, v_sid, NULL, v_qty, v_costo_u,
              round(v_qty * v_costo_u, 4)
            );
          ELSE
            v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
            );
          END IF;
        END LOOP;
      ELSE
        v_sid := public.fn_resolver_insumo_espiral_por_hojas(v_hojas);
        v_costo_u := public.fn_costo_unitario_insumo(v_sid);
        INSERT INTO public.pedido_items_insumos (
          pedido_item_id, insumo_id, equipo_id, cantidad,
          costo_unitario_congelado, costo_total
        ) VALUES (
          it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
        );
        IF v_tapa_f IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_tapa_f);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_tapa_f, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
        IF v_tapa_d IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_tapa_d);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_tapa_d, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
      END IF;
    END IF;

    IF NOT v_solo AND COALESCE(v_anillado_mm, 0) > 0 THEN
      SELECT count(*) INTO v_cnt_an FROM public.recetas_items
      WHERE alcance = 'ANILLADO_EXTRA';
      IF v_cnt_an > 0 THEN
        FOR r IN
          SELECT * FROM public.recetas_items WHERE alcance = 'ANILLADO_EXTRA'
        LOOP
          v_qty := r.cantidad::numeric;
          IF r.modo_consumo = 'POR_CARA' THEN
            v_qty := v_qty * v_carillas * v_copias;
          ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
            v_qty := v_qty * v_hojas * v_copias;
          ELSE
            v_qty := v_qty * v_copias;
          END IF;
          IF r.es_espiral_auto THEN
            v_sid := public.fn_resolver_insumo_espiral_por_hojas(
              GREATEST(v_hojas, 1)
            );
            v_costo_u := public.fn_costo_unitario_insumo(v_sid);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, v_sid, NULL, v_qty, v_costo_u,
              round(v_qty * v_costo_u, 4)
            );
          ELSE
            v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
            );
          END IF;
        END LOOP;
      ELSE
        v_sid := public.fn_resolver_insumo_espiral_por_hojas(GREATEST(v_hojas, 1));
        v_costo_u := public.fn_costo_unitario_insumo(v_sid);
        INSERT INTO public.pedido_items_insumos (
          pedido_item_id, insumo_id, equipo_id, cantidad,
          costo_unitario_congelado, costo_total
        ) VALUES (
          it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
        );
        IF v_tapa_f IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_tapa_f);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_tapa_f, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
        IF v_tapa_d IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_tapa_d);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_tapa_d, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
      END IF;
    END IF;

  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.rpc_explotar_bom_pedido(uuid) IS
  'pedido_items_insumos: impresión vía reglas_costo (si existen) o recetas; cantidad = cantidad_usada × páginas × copias.';

GRANT EXECUTE ON FUNCTION public.rpc_explotar_bom_pedido(uuid) TO authenticated;

-- Refrescar precios_impresion tras migración (nuevo costo unitario / factor 10%)
UPDATE public.precios_impresion p
SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id);
