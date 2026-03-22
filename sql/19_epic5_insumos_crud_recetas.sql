-- ============================================================================
-- 19 — Épica 5: snapshot costo reposición en recetas + propagación a tarifario
-- Requiere: 09, 11, 12 (fn_costo_unitario_insumo, fn_costo_directo_unidad_tarifa_impresion)
-- ============================================================================

-- ── 1) Columna snapshot en recetas_items ─────────────────────────────────────
ALTER TABLE public.recetas_items
  ADD COLUMN IF NOT EXISTS costo_unitario_reposicion numeric;

COMMENT ON COLUMN public.recetas_items.costo_unitario_reposicion IS
  'Costo unitario de reposición del insumo (costo_base ÷ contenido); se sincroniza al editar insumo o receta.';

-- ── 2) Refrescar snapshot por insumo ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_refresh_recetas_costo_reposicion(p_insumo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recetas_items ri
  SET costo_unitario_reposicion = public.fn_costo_unitario_insumo(ri.insumo_id)
  WHERE ri.insumo_id = p_insumo_id
    AND ri.es_espiral_auto = false
    AND ri.insumo_id IS NOT NULL;
END;
$$;

-- ── 3) Actualizar costo_insumo_directo en precios_impresion afectados ─────────
CREATE OR REPLACE FUNCTION public.fn_refresh_precios_costo_por_insumo(p_insumo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v numeric;
BEGIN
  FOR r IN
    SELECT DISTINCT ri.precio_impresion_id AS pid
    FROM public.recetas_items ri
    WHERE ri.alcance = 'IMPRESION'
      AND ri.precio_impresion_id IS NOT NULL
      AND ri.insumo_id = p_insumo_id
      AND ri.es_espiral_auto = false
  LOOP
    v := public.fn_costo_directo_unidad_tarifa_impresion(r.pid);
    UPDATE public.precios_impresion
    SET costo_insumo_directo = v
    WHERE id = r.pid;
  END LOOP;
END;
$$;

-- ── 4) Tras cambiar costo del insumo: propagar ────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_insumos_propaga_costo_recetas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.costo_base IS DISTINCT FROM NEW.costo_base OR
    OLD.precio_compra IS DISTINCT FROM NEW.precio_compra OR
    OLD.unidad_venta_equivalente IS DISTINCT FROM NEW.unidad_venta_equivalente
  ) THEN
    PERFORM public.fn_refresh_recetas_costo_reposicion(NEW.id);
    PERFORM public.fn_refresh_precios_costo_por_insumo(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insumos_propaga_costo_recetas ON public.insumos;
CREATE TRIGGER trg_insumos_propaga_costo_recetas
  AFTER UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_insumos_propaga_costo_recetas();

-- ── 5) Al insertar/actualizar línea de receta: snapshot ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_recetas_set_costo_reposicion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.es_espiral_auto = true OR NEW.insumo_id IS NULL THEN
    NEW.costo_unitario_reposicion := NULL;
  ELSE
    NEW.costo_unitario_reposicion := public.fn_costo_unitario_insumo(NEW.insumo_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recetas_set_costo_reposicion ON public.recetas_items;
CREATE TRIGGER trg_recetas_set_costo_reposicion
  BEFORE INSERT OR UPDATE ON public.recetas_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recetas_set_costo_reposicion();

-- ── 6) Backfill ──────────────────────────────────────────────────────────────
UPDATE public.recetas_items ri
SET costo_unitario_reposicion = public.fn_costo_unitario_insumo(ri.insumo_id)
WHERE ri.insumo_id IS NOT NULL AND ri.es_espiral_auto = false;

UPDATE public.precios_impresion pi
SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(pi.id)
WHERE EXISTS (
  SELECT 1 FROM public.recetas_items ri
  WHERE ri.precio_impresion_id = pi.id AND ri.alcance = 'IMPRESION'
);

-- ── 7) Borrado físico seguro (falla si hay vínculos) ─────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_insumo_fisico(p_insumo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_ped bigint;
  n_mov bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.recetas_items
    WHERE insumo_id = p_insumo_id AND es_espiral_auto = false
  ) THEN
    RAISE EXCEPTION 'INSUMO_EN_RECETA_ACTIVA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.configuracion_negocio
    WHERE id = 1
      AND (insumo_tapa_frontal_id = p_insumo_id OR insumo_tapa_dorsal_id = p_insumo_id)
  ) THEN
    RAISE EXCEPTION 'INSUMO_EN_CONFIG_ANILLADO';
  END IF;

  SELECT count(*) INTO n_ped FROM public.pedido_items_insumos WHERE insumo_id = p_insumo_id;
  IF n_ped > 0 THEN
    RAISE EXCEPTION 'INSUMO_EN_HISTORIAL_PEDIDOS';
  END IF;

  SELECT count(*) INTO n_mov FROM public.stock_movimientos WHERE insumo_id = p_insumo_id;
  IF n_mov > 0 THEN
    RAISE EXCEPTION 'INSUMO_CON_MOVIMIENTOS_STOCK';
  END IF;

  DELETE FROM public.insumos WHERE id = p_insumo_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_delete_insumo_fisico(uuid) IS
  'Borra insumo solo si no está en recetas, config tapas, BOM de pedidos ni movimientos de stock.';

GRANT EXECUTE ON FUNCTION public.rpc_delete_insumo_fisico(uuid) TO authenticated;
