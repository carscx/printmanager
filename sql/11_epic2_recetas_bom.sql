-- ============================================================================
-- 11 — Épica 2: Recetas BOM, explosión de materiales, validación señado
-- Requiere: 03, 05, 09, 10
-- ============================================================================

-- ── 1) Configuración anillado automático (umbrales + medidas mm espiral) ─────
ALTER TABLE public.configuracion_negocio
  ADD COLUMN IF NOT EXISTS anillado_umbral_chico_max integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS anillado_umbral_mediano_max integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS espiral_chico_medida_mm integer NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS espiral_mediano_medida_mm integer NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS espiral_grande_medida_mm integer NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS insumo_tapa_frontal_id uuid REFERENCES public.insumos(id),
  ADD COLUMN IF NOT EXISTS insumo_tapa_dorsal_id uuid REFERENCES public.insumos(id);

COMMENT ON COLUMN public.configuracion_negocio.anillado_umbral_chico_max IS
  'Hojas físicas máximas para espiral chico (≤ este valor).';
COMMENT ON COLUMN public.configuracion_negocio.anillado_umbral_mediano_max IS
  'Hojas físicas máximas para espiral mediano (entre chico+1 y este valor).';

-- ── 2) pedido_items: vínculos a tarifario y solo anillado ───────────────────
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS solo_anillado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS precio_impresion_id uuid REFERENCES public.precios_impresion(id),
  ADD COLUMN IF NOT EXISTS precio_anillado_id uuid REFERENCES public.precios_anillado(id),
  ADD COLUMN IF NOT EXISTS anillado_medida_mm integer;

COMMENT ON COLUMN public.pedido_items.solo_anillado IS
  'Cliente trae impresión; solo materiales de encuadernación.';
COMMENT ON COLUMN public.pedido_items.anillado_medida_mm IS
  'Medida mm del anillado elegido en tarifa (referencia).';

-- ── 3) Tabla recetas_items (BOM) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recetas_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alcance text NOT NULL CHECK (alcance IN ('IMPRESION', 'SOLO_ANILLADO', 'ANILLADO_EXTRA')),
  precio_impresion_id uuid REFERENCES public.precios_impresion(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES public.insumos(id) ON DELETE CASCADE,
  modo_consumo text NOT NULL CHECK (modo_consumo IN ('POR_CARA', 'POR_HOJA_FISICA', 'POR_TRABAJO')),
  cantidad numeric NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  es_espiral_auto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_receta_alcance_impresion CHECK (
    (alcance = 'IMPRESION' AND precio_impresion_id IS NOT NULL)
    OR (alcance IN ('SOLO_ANILLADO', 'ANILLADO_EXTRA') AND precio_impresion_id IS NULL)
  ),
  CONSTRAINT chk_receta_espiral_auto CHECK (
    (es_espiral_auto = false AND insumo_id IS NOT NULL)
    OR (es_espiral_auto = true AND insumo_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_recetas_precio_imp ON public.recetas_items (precio_impresion_id)
  WHERE alcance = 'IMPRESION';
CREATE INDEX IF NOT EXISTS idx_recetas_alcance ON public.recetas_items (alcance);

COMMENT ON TABLE public.recetas_items IS
  'BOM: insumos por tarifa de impresión o bloques de anillado (espiral auto = sin insumo fijo).';

ALTER TABLE public.recetas_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recetas_items_all" ON public.recetas_items;
CREATE POLICY "recetas_items_all"
  ON public.recetas_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── 4) Helpers: hojas físicas y resolución espiral ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hojas_fisicas(paginas integer, doble_faz boolean)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN paginas IS NULL OR paginas < 0 THEN 0
    WHEN doble_faz THEN CEIL(paginas::numeric / 2)::integer
    ELSE paginas
  END;
$$;

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
  SELECT * INTO cn FROM public.configuracion_negocio WHERE id = 1;
  IF p_hojas IS NULL OR p_hojas < 1 THEN
    RAISE EXCEPTION 'HOJAS_INVALIDAS';
  END IF;
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
    AND i.activo
    AND i.medida_mm = mid
  ORDER BY i.nombre
  LIMIT 1;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'ESPIRAL_NO_CONFIGURADA: medida_mm=%', mid;
  END IF;
  RETURN sid;
END;
$$;

-- Costo unitario = costo_base ÷ unidad_venta_equivalente (única fuente de prorrateo).
CREATE OR REPLACE FUNCTION public.fn_costo_unitario_insumo(p_insumo_id uuid)
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

-- Misma fórmula que fn_costo_unitario_insumo (evita costo "bulto" si 09 tenía lógica vieja)
CREATE OR REPLACE FUNCTION public.fn_costo_por_unidad_venta(p_insumo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_costo_unitario_insumo(p_insumo_id);
$$;

-- ── 5) Explosión BOM → pedido_items_insumos ─────────────────────────────────
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

    -- Impresión (tinta/papel según receta)
    IF NOT v_solo AND v_carillas > 0 AND v_pid_imp IS NOT NULL THEN
      SELECT count(*) INTO v_cnt_imp
      FROM public.recetas_items
      WHERE alcance = 'IMPRESION' AND precio_impresion_id = v_pid_imp;
      IF v_cnt_imp = 0 THEN
        RAISE EXCEPTION 'RECETA_INCOMPLETA: sin BOM para precio_impresion_id=%', v_pid_imp;
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
    ELSIF NOT v_solo AND v_carillas > 0 AND v_pid_imp IS NULL THEN
      RAISE EXCEPTION 'RECETA_INCOMPLETA: falta precio_impresion_id en ítem';
    END IF;

    -- Solo anillado: recetas SOLO_ANILLADO (sin papel/tinta si no hay filas)
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
        -- Fallback: espiral + tapas desde config
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

    -- Anillado adicional (con impresión): ANILLADO_EXTRA + espiral/tapas
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
  'Genera pedido_items_insumos según recetas y reglas de anillado.';

GRANT EXECUTE ON FUNCTION public.rpc_explotar_bom_pedido(uuid) TO authenticated;

-- ── 6) Validación antes de señado / pagado ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pedido_tiene_bom_completo(p_pedido_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.pedido_items pi WHERE pi.pedido_id = p_pedido_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.pedido_items pi
      WHERE pi.pedido_id = p_pedido_id
        AND NOT EXISTS (
          SELECT 1 FROM public.pedido_items_insumos pii
          WHERE pii.pedido_item_id = pi.id
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.trg_pedidos_validar_bom_antes_senado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
    AND NEW.estado IN ('señado', 'pagado')
    AND COALESCE(OLD.estado, '') <> 'cancelado'
  THEN
    IF NOT public.fn_pedido_tiene_bom_completo(NEW.id) THEN
      RAISE EXCEPTION 'BOM_INCOMPLETO: ejecutá la explosión de materiales antes de señar (rpc_explotar_bom_pedido)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_validar_bom ON public.pedidos;
CREATE TRIGGER trg_pedidos_validar_bom
  BEFORE UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public.trg_pedidos_validar_bom_antes_senado();
