-- ============================================================================
-- 25 — Al cambiar costo de insumo: refrescar snapshot en recetas_items
-- ============================================================================
-- El trigger `trg_insumos_refresh_tarifas_costo` (épica 5) ya actualiza
-- precios_impresion / precios_anillado; faltaba volver a ejecutar
-- fn_refresh_recetas_costo_reposicion cuando se eliminó el trigger antiguo
-- `trg_insumos_propaga_costo_recetas` (script 20).
-- ============================================================================

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
    PERFORM public.fn_refresh_recetas_costo_reposicion(NEW.id);

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

COMMENT ON FUNCTION public.trg_insumos_refresh_tarifas_costo() IS
  'Tras cambiar costo/rendimiento del insumo: actualiza costo_unitario_reposicion en recetas_items y costo_insumo_directo en tarifas (impresión y anillado).';
