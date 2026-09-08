-- ============================================================================
-- 61 — Productos cerrados (Agenda Semanal): catálogo, BOM fijo, explosión
-- Requiere: 50 (rpc_explotar_bom_pedido), 60 (RLS canónico)
--
-- Un presupuesto de producto cerrado es el mismo `pedidos` (modalidad presupuesto).
-- La línea lleva `pedido_items.producto_id`; el BOM no usa páginas PDF.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  precio_venta numeric NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos (activo);

COMMENT ON TABLE public.productos IS
  'Catálogo de productos cerrados (precio único). Ej. Agenda Semanal.';

CREATE TABLE IF NOT EXISTS public.productos_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  UNIQUE (producto_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_productos_insumos_producto
  ON public.productos_insumos (producto_id);

COMMENT ON TABLE public.productos_insumos IS
  'BOM de producto cerrado: cantidad de insumo por unidad (papel: hojas).';

ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS producto_id uuid REFERENCES public.productos(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_pedido_items_producto_id
  ON public.pedido_items (producto_id);

COMMENT ON COLUMN public.pedido_items.producto_id IS
  'Si está seteado, la línea es un producto cerrado (no cotización de impresión).';

INSERT INTO public.productos (nombre, slug, precio_venta, activo)
SELECT 'Agenda Semanal', 'agenda_semanal', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.productos WHERE slug = 'agenda_semanal'
);

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos_insumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_all_authenticated" ON public.productos;
CREATE POLICY "productos_all_authenticated"
  ON public.productos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "productos_insumos_all_authenticated" ON public.productos_insumos;
CREATE POLICY "productos_insumos_all_authenticated"
  ON public.productos_insumos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos_insumos TO authenticated;

-- rpc_explotar_bom_pedido se redefine más abajo (rama producto_id + lógica del 50).

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

    -- Producto cerrado: N unidades de insumo × copias (sin páginas PDF).
    IF it.producto_id IS NOT NULL THEN
      FOR r IN
        SELECT pi.insumo_id, pi.cantidad
        FROM public.productos_insumos pi
        WHERE pi.producto_id = it.producto_id
      LOOP
        v_qty := r.cantidad::numeric * v_copias;
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
      CONTINUE;
    END IF;

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
          SELECT rc.*, i.categoria AS insumo_cat
          FROM public.reglas_costo rc
          INNER JOIN public.insumos i ON i.id = rc.insumo_id
          WHERE rc.precio_impresion_id = v_pid_imp
            AND rc.activo
            AND rc.insumo_id IS NOT NULL
        LOOP
          IF r.insumo_cat = 'papel' THEN
            v_qty := r.cantidad_usada::numeric * v_hojas * v_copias;
          ELSE
            v_qty := r.cantidad_usada::numeric * v_carillas * v_copias;
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
  'BOM pedido: producto cerrado = productos_insumos × copias; impresión: papel × hojas físicas × copias; tinta/tóner en carillas.';

GRANT EXECUTE ON FUNCTION public.rpc_explotar_bom_pedido(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
