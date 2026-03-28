-- ============================================================================
-- 49 — Tinta: stock en ml vs costo en $/página + rendimiento conservador 25 pág/ml
-- Requiere: 23 (rpc_explotar_bom_pedido), 27 (fn_costo_unitario_insumo tinta)
--
-- Problema: fn_costo_unitario_insumo devuelve $ por PÁGINA para tinta, pero
-- pedido_items_insumos.cantidad se guardaba en “unidades de receta × páginas”
-- y fn_aplicar_stock_preventivo restaba ese número del stock en ml → se
-- descontaba ~1 ml por página en lugar de ~1/25 ml.
--
-- Solución: al insertar líneas de impresión (reglas_costo / recetas_items),
-- si el insumo es tinta, cantidad = ml = páginas_equivalente / páginas_por_ml
-- y costo_unitario_congelado = $/ml = $/página × páginas_por_ml (costo_total
-- se mantiene).
--
-- Rendimiento por defecto: 25 páginas por ml (conservador vs 30–40 teóricas).
-- ============================================================================

-- ── 1) Costo unitario tinta: default páginas/ml 30 → 25 ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_costo_unitario_insumo(p_insumo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p_insumo_id IS NULL THEN 0::numeric
        WHEN i.categoria = 'tinta' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / (
            1000.0 * NULLIF(
              GREATEST(COALESCE(NULLIF(i.rendimiento, 0), 25), 1)::numeric,
              0
            )
          )
        WHEN COALESCE(i.rendimiento, 0) > 0 THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / NULLIF(i.rendimiento::numeric, 0)
        WHEN i.categoria = 'toner' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0) / 1800::numeric
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

COMMENT ON FUNCTION public.fn_costo_unitario_insumo(uuid) IS
  'Costo por unidad de consumo: tinta = (precio litro) / (1000 × páginas/ml); $/página; stock PII en ml usa fn_normalizar_cantidad_stock_pii.';

-- ── 2) Normalizar cantidad/costo congelado para pedido_items_insumos ─────────
CREATE OR REPLACE FUNCTION public.fn_normalizar_cantidad_stock_pii(
  p_insumo_id uuid,
  p_qty numeric,
  p_cuo numeric
)
RETURNS TABLE(o_qty numeric, o_cuo numeric, o_ct numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN i.categoria = 'tinta' THEN
        p_qty / GREATEST(
          COALESCE(NULLIF(i.rendimiento, 0), 25)::numeric,
          1::numeric
        )
      ELSE p_qty
    END,
    CASE
      WHEN i.categoria = 'tinta' THEN
        p_cuo * GREATEST(
          COALESCE(NULLIF(i.rendimiento, 0), 25)::numeric,
          1::numeric
        )
      ELSE p_cuo
    END,
    round(
      (CASE
        WHEN i.categoria = 'tinta' THEN
          p_qty / GREATEST(
            COALESCE(NULLIF(i.rendimiento, 0), 25)::numeric,
            1::numeric
          )
        ELSE p_qty
      END) *
      (CASE
        WHEN i.categoria = 'tinta' THEN
          p_cuo * GREATEST(
            COALESCE(NULLIF(i.rendimiento, 0), 25)::numeric,
            1::numeric
          )
        ELSE p_cuo
      END),
      4
    )
  FROM public.insumos i
  WHERE i.id = p_insumo_id
  UNION ALL
  SELECT p_qty, p_cuo, round(p_qty * p_cuo, 4)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.insumos j WHERE j.id = p_insumo_id
  );
$$;

COMMENT ON FUNCTION public.fn_normalizar_cantidad_stock_pii(uuid, numeric, numeric) IS
  'Tinta: convierte cantidad lógica (× páginas receta) a ml y costo congelado a $/ml; resto sin cambio.';

GRANT EXECUTE ON FUNCTION public.fn_normalizar_cantidad_stock_pii(uuid, numeric, numeric)
  TO authenticated;

-- ── 3) rpc_explotar_bom_pedido: aplicar normalización en bloque impresión ───
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
  v_costo_tot numeric;
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
          SELECT o_qty, o_cuo, o_ct
          INTO v_qty, v_costo_u, v_costo_tot
          FROM public.fn_normalizar_cantidad_stock_pii(r.insumo_id, v_qty, v_costo_u);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, r.insumo_id, NULL, v_qty, v_costo_u, v_costo_tot
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
            SELECT o_qty, o_cuo, o_ct
            INTO v_qty, v_costo_u, v_costo_tot
            FROM public.fn_normalizar_cantidad_stock_pii(r.insumo_id, v_qty, v_costo_u);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, v_costo_tot
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
  'BOM pedido: tinta en impresión guarda cantidad en ml y costo unitario $/ml; costo_total igual que antes.';

GRANT EXECUTE ON FUNCTION public.rpc_explotar_bom_pedido(uuid) TO authenticated;
