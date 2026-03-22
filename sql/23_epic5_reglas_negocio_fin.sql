-- ============================================================================
-- 23 — Épica 5 cierre: Chico/Mediano/Grande, rango en espirales, RPC sin bloqueos,
--     resolución de stock anillado por mm + categoría tarifa.
-- Requiere: 22
-- ============================================================================

-- ── 1) precios_anillado: etiqueta de tarifa (Chico / Mediano / Grande) ───────
ALTER TABLE public.precios_anillado
  ADD COLUMN IF NOT EXISTS nombre_categoria text;

UPDATE public.precios_anillado pa
SET nombre_categoria = o.nombre
FROM (
  SELECT
    id,
    CASE (row_number() OVER (ORDER BY medida_mm ASC NULLS LAST))
      WHEN 1 THEN 'Chico'
      WHEN 2 THEN 'Mediano'
      ELSE 'Grande'
    END AS nombre
  FROM public.precios_anillado
) o
WHERE pa.id = o.id AND (pa.nombre_categoria IS NULL OR btrim(pa.nombre_categoria) = '');

ALTER TABLE public.precios_anillado
  ALTER COLUMN nombre_categoria SET DEFAULT 'Mediano';

UPDATE public.precios_anillado
SET nombre_categoria = 'Mediano'
WHERE nombre_categoria IS NULL;

ALTER TABLE public.precios_anillado
  ALTER COLUMN nombre_categoria SET NOT NULL;

ALTER TABLE public.precios_anillado
  DROP CONSTRAINT IF EXISTS precios_anillado_nombre_categoria_check;
ALTER TABLE public.precios_anillado
  ADD CONSTRAINT precios_anillado_nombre_categoria_check
  CHECK (nombre_categoria IN ('Chico', 'Mediano', 'Grande'));

COMMENT ON COLUMN public.precios_anillado.nombre_categoria IS
  'Etiqueta de tarifa (rango); alinea con insumos espiral.rango_anillado.';

-- Quitar unicidad por medida (varias filas pueden existir; UI usa nombre_categoria)
ALTER TABLE public.precios_anillado
  DROP CONSTRAINT IF EXISTS precios_anillado_medida_mm_key;

CREATE INDEX IF NOT EXISTS idx_precios_anillado_nombre_categoria
  ON public.precios_anillado (nombre_categoria);

-- ── 2) insumos espiral: rango para mapear a tarifa ───────────────────────────
ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS rango_anillado text;

ALTER TABLE public.insumos
  DROP CONSTRAINT IF EXISTS insumos_rango_anillado_check;
ALTER TABLE public.insumos
  ADD CONSTRAINT insumos_rango_anillado_check
  CHECK (
    rango_anillado IS NULL
    OR rango_anillado IN ('Chico', 'Mediano', 'Grande')
  );

COMMENT ON COLUMN public.insumos.rango_anillado IS
  'Solo espirales: coincide con precios_anillado.nombre_categoria.';

UPDATE public.insumos i
SET rango_anillado = pa.nombre_categoria
FROM public.precios_anillado pa
WHERE i.categoria = 'espiral'
  AND i.medida_mm IS NOT NULL
  AND pa.medida_mm = i.medida_mm
  AND i.rango_anillado IS NULL;

-- ── 3) Costo unitario: maestros tóner / tinta / papel si rendimiento ≤ 0 ─────
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
        WHEN i.categoria = 'toner' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0) / 1800::numeric
        WHEN i.categoria = 'tinta' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0) / 30000::numeric
        WHEN i.categoria = 'papel' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / NULLIF(
            GREATEST(
              COALESCE(NULLIF(i.hojas_por_unidad, 0), 0),
              500
            )::numeric,
            0
          )
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

-- ── 4) Resolver espiral: sin excepciones (NULL = no insertar) ────────────────
CREATE OR REPLACE FUNCTION public.fn_resolver_insumo_espiral_por_hojas(p_hojas integer)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cn public.configuracion_negocio%ROWTYPE;
  mid integer;
  sid uuid;
BEGIN
  IF p_hojas IS NULL OR p_hojas < 1 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO cn FROM public.configuracion_negocio WHERE id = 1;
  IF p_hojas <= COALESCE(cn.anillado_umbral_chico_max, 80) THEN
    mid := COALESCE(cn.espiral_chico_medida_mm, 16);
  ELSIF p_hojas <= COALESCE(cn.anillado_umbral_mediano_max, 200) THEN
    mid := COALESCE(cn.espiral_mediano_medida_mm, 22);
  ELSE
    mid := COALESCE(cn.espiral_grande_medida_mm, 28);
  END IF;
  SELECT i.id INTO sid
  FROM public.insumos i
  WHERE i.categoria = 'espiral'
    AND COALESCE(i.activo, true)
    AND i.medida_mm = mid
  ORDER BY i.nombre
  LIMIT 1;
  RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_resolver_insumo_espiral_por_mm_rango(
  p_mm integer,
  p_rango text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  sid uuid;
BEGIN
  IF p_mm IS NULL OR p_mm < 1 THEN
    RETURN NULL;
  END IF;
  SELECT i.id INTO sid
  FROM public.insumos i
  WHERE i.categoria = 'espiral'
    AND COALESCE(i.activo, true)
    AND i.medida_mm = p_mm
    AND (
      p_rango IS NULL
      OR btrim(p_rango) = ''
      OR i.rango_anillado IS NULL
      OR i.rango_anillado = p_rango
    )
  ORDER BY i.nombre
  LIMIT 1;
  RETURN sid;
END;
$$;

COMMENT ON FUNCTION public.fn_resolver_insumo_espiral_por_mm_rango(integer, text) IS
  'Espiral por medida mm y rango de tarifa (Chico/Mediano/Grande); NULL si no hay match.';

-- ── 5) Sin validación dura de BOM al pasar a señado ───────────────────────────
DROP TRIGGER IF EXISTS trg_pedidos_validar_bom ON public.pedidos;

-- ── 6) rpc_explotar_bom_pedido: sin RAISE; anillado extra por mm + categoría ─
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
  v_rango_cat text;
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

    v_rango_cat := NULL;
    IF it.precio_anillado_id IS NOT NULL THEN
      SELECT pa.nombre_categoria INTO v_rango_cat
      FROM public.precios_anillado pa
      WHERE pa.id = it.precio_anillado_id;
    END IF;

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

        IF v_cnt_imp > 0 THEN
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
      END IF;
    END IF;

    IF v_solo AND v_carillas >= 1 THEN
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
                IF v_sid IS NOT NULL THEN
                  v_costo_u := public.fn_costo_unitario_insumo(v_sid);
                  INSERT INTO public.pedido_items_insumos (
                    pedido_item_id, insumo_id, equipo_id, cantidad,
                    costo_unitario_congelado, costo_total
                  ) VALUES (
                    it.id, v_sid, NULL, v_qty, v_costo_u,
                    round(v_qty * v_costo_u, 4)
                  );
                END IF;
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
            v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
              v_anillado_mm,
              v_rango_cat
            );
            IF v_sid IS NULL THEN
              v_sid := public.fn_resolver_insumo_espiral_por_hojas(v_hojas);
            END IF;
            IF v_sid IS NOT NULL THEN
              v_costo_u := public.fn_costo_unitario_insumo(v_sid);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
              );
            END IF;
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
              IF v_sid IS NOT NULL THEN
                v_costo_u := public.fn_costo_unitario_insumo(v_sid);
                INSERT INTO public.pedido_items_insumos (
                  pedido_item_id, insumo_id, equipo_id, cantidad,
                  costo_unitario_congelado, costo_total
                ) VALUES (
                  it.id, v_sid, NULL, v_qty, v_costo_u,
                  round(v_qty * v_costo_u, 4)
                );
              END IF;
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
          v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
            v_anillado_mm,
            v_rango_cat
          );
          IF v_sid IS NULL THEN
            v_sid := public.fn_resolver_insumo_espiral_por_hojas(v_hojas);
          END IF;
          IF v_sid IS NOT NULL THEN
            v_costo_u := public.fn_costo_unitario_insumo(v_sid);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
            );
          END IF;
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
            v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
              v_anillado_mm,
              v_rango_cat
            );
            IF v_sid IS NULL THEN
              v_sid := public.fn_resolver_insumo_espiral_por_hojas(
                GREATEST(v_hojas, 1)
              );
            END IF;
            IF v_sid IS NOT NULL THEN
              v_costo_u := public.fn_costo_unitario_insumo(v_sid);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, v_sid, NULL, v_qty, v_costo_u,
                round(v_qty * v_costo_u, 4)
              );
            END IF;
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
        v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
          v_anillado_mm,
          v_rango_cat
        );
        IF v_sid IS NULL THEN
          v_sid := public.fn_resolver_insumo_espiral_por_hojas(GREATEST(v_hojas, 1));
        END IF;
        IF v_sid IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_sid);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
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
  'Épica 5: sin excepciones BOM; anillado por mm + nombre_categoria tarifa; tapas 1 u/copia.';

GRANT EXECUTE ON FUNCTION public.rpc_explotar_bom_pedido(uuid) TO authenticated;
