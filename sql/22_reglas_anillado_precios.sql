-- ============================================================================
-- 22 — Reglas de negocio también para tarifas de anillado (precios_anillado)
-- Requiere: 20, 21
-- ============================================================================

-- ── 1) reglas_costo: una tarifa de impresión O una de anillado (no ambas) ───
ALTER TABLE public.reglas_costo
  DROP CONSTRAINT IF EXISTS reglas_costo_tarifa_una;

ALTER TABLE public.reglas_costo
  ALTER COLUMN precio_impresion_id DROP NOT NULL;

ALTER TABLE public.reglas_costo
  ADD COLUMN IF NOT EXISTS precio_anillado_id uuid REFERENCES public.precios_anillado(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reglas_costo_anillado
  ON public.reglas_costo (precio_anillado_id)
  WHERE precio_anillado_id IS NOT NULL;

ALTER TABLE public.reglas_costo
  ADD CONSTRAINT reglas_costo_tarifa_una CHECK (
    (precio_impresion_id IS NOT NULL AND precio_anillado_id IS NULL)
    OR (precio_impresion_id IS NULL AND precio_anillado_id IS NOT NULL)
  );

COMMENT ON COLUMN public.reglas_costo.precio_anillado_id IS
  'Tarifa de anillado (medida mm); alternativa exclusiva a precio_impresion_id.';

-- ── 2) Costo directo tarifa anillado (+10% como impresión) ───────────────────
CREATE OR REPLACE FUNCTION public.fn_costo_directo_unidad_tarifa_anillado(
  p_precio_anillado_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_reglas numeric;
  v_tiene boolean;
  v_factor_seguridad constant numeric := 1.10;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.reglas_costo rc
    WHERE rc.precio_anillado_id = p_precio_anillado_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL
  ) INTO v_tiene;

  IF v_tiene THEN
    SELECT COALESCE(SUM(
      public.fn_costo_unitario_insumo(rc.insumo_id) * rc.cantidad_usada
    ), 0) INTO v_reglas
    FROM public.reglas_costo rc
    WHERE rc.precio_anillado_id = p_precio_anillado_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL;

    IF v_reglas > 0 THEN
      RETURN round(v_reglas * v_factor_seguridad, 4);
    END IF;
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

-- ── 3) Triggers: insumos → refrescar tarifas impresión y anillado ───────────
DROP TRIGGER IF EXISTS trg_insumos_refresh_tarifas_costo ON public.insumos;
CREATE OR REPLACE FUNCTION public.trg_insumos_refresh_tarifas_costo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  aid uuid;
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
      WHERE rc.insumo_id = NEW.id AND rc.precio_impresion_id IS NOT NULL
    LOOP
      UPDATE public.precios_impresion p
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
      WHERE p.id = pid;
    END LOOP;

    FOR aid IN
      SELECT DISTINCT rc.precio_anillado_id
      FROM public.reglas_costo rc
      WHERE rc.insumo_id = NEW.id AND rc.precio_anillado_id IS NOT NULL
    LOOP
      UPDATE public.precios_anillado pa
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_anillado(pa.id)
      WHERE pa.id = aid;
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

-- ── 4) Trigger reglas_costo → precios_impresion o precios_anillado ───────────
DROP TRIGGER IF EXISTS trg_reglas_refresh_tarifa ON public.reglas_costo;
CREATE OR REPLACE FUNCTION public.trg_reglas_refresh_tarifa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  aid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    pid := OLD.precio_impresion_id;
    aid := OLD.precio_anillado_id;
  ELSE
    pid := NEW.precio_impresion_id;
    aid := NEW.precio_anillado_id;
  END IF;

  IF pid IS NOT NULL THEN
    UPDATE public.precios_impresion p
    SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
    WHERE p.id = pid;
  END IF;
  IF aid IS NOT NULL THEN
    UPDATE public.precios_anillado pa
    SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_anillado(pa.id)
    WHERE pa.id = aid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_reglas_refresh_tarifa
  AFTER INSERT OR UPDATE OR DELETE ON public.reglas_costo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reglas_refresh_tarifa();

UPDATE public.precios_anillado pa
SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_anillado(pa.id);

-- ── 5) Explosión: solo anillado con reglas por precio_anillado_id ─────────────
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
  v_pid_an uuid;
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
          RAISE EXCEPTION 'MATERIAL_INCOMPLETO: sin reglas ni listado legacy para precio_impresion_id=%', v_pid_imp;
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
      RAISE EXCEPTION 'MATERIAL_INCOMPLETO: falta precio_impresion_id en ítem';
    END IF;

    IF v_solo THEN
      IF v_carillas < 1 THEN
        RAISE EXCEPTION 'SOLO_ANILLADO_SIN_HOJAS: indicá cantidad de hojas para el espiral';
      END IF;
      v_pid_an := it.precio_anillado_id;
      IF v_pid_an IS NOT NULL THEN
        SELECT count(*) INTO v_cnt_reg
        FROM public.reglas_costo
        WHERE precio_anillado_id = v_pid_an
          AND activo
          AND insumo_id IS NOT NULL;

        IF v_cnt_reg > 0 THEN
          FOR r IN
            SELECT * FROM public.reglas_costo
            WHERE precio_anillado_id = v_pid_an
              AND activo
              AND insumo_id IS NOT NULL
          LOOP
            v_qty := r.cantidad_usada::numeric * v_copias;
            v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
            );
          END LOOP;
        ELSE
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
      ELSE
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
  'Consumos por ítem: impresión y solo anillado vía reglas_costo cuando existan; fallback legacy.';

GRANT EXECUTE ON FUNCTION public.rpc_explotar_bom_pedido(uuid) TO authenticated;
