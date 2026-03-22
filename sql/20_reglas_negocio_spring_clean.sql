-- ============================================================================
-- 20 — Spring cleaning: FKs débiles, reglas_costo, motor sin fallos duros
-- Requiere: 03, 05, 09, 11, 12, 19 (si 19 no corrió, los DROP IF EXISTS no fallan)
-- ============================================================================

-- ── 1) Quitar triggers de propagación (épica 5) ─────────────────────────────
DROP TRIGGER IF EXISTS trg_insumos_propaga_costo_recetas ON public.insumos;
DROP TRIGGER IF EXISTS trg_recetas_set_costo_reposicion ON public.recetas_items;

-- ── 2) Columnas “simples” en insumos (alias de negocio) ──────────────────────
ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS costo_compra numeric,
  ADD COLUMN IF NOT EXISTS unidades_por_compra numeric;

UPDATE public.insumos
SET
  costo_compra = COALESCE(costo_compra, precio_compra, costo_base, 0),
  unidades_por_compra = COALESCE(
    NULLIF(unidades_por_compra, 0),
    NULLIF(unidad_venta_equivalente, 0),
    1
  )
WHERE true;

COMMENT ON COLUMN public.insumos.costo_compra IS
  'Precio del lote; costo unitario = costo_compra / unidades_por_compra.';
COMMENT ON COLUMN public.insumos.unidades_por_compra IS
  'Unidades de consumo por lote (ej. 500 hojas).';

-- ── 3) fn_costo_unitario_insumo: nunca NULL; insumo inexistente = 0 ───────────
CREATE OR REPLACE FUNCTION public.fn_costo_unitario_insumo(p_insumo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p_insumo_id IS NULL THEN 0::numeric
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

-- ── 4) Tabla reglas_costo (relación débil con insumo) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.reglas_costo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  precio_impresion_id uuid NOT NULL REFERENCES public.precios_impresion(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES public.insumos(id) ON DELETE SET NULL,
  cantidad_usada numeric NOT NULL DEFAULT 1 CHECK (cantidad_usada > 0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reglas_costo_precio ON public.reglas_costo (precio_impresion_id);
CREATE INDEX IF NOT EXISTS idx_reglas_costo_insumo ON public.reglas_costo (insumo_id)
  WHERE insumo_id IS NOT NULL;

COMMENT ON TABLE public.reglas_costo IS
  'Componentes de costo por tarifa de impresión; insumo opcional (borrado → NULL, costo 0).';

ALTER TABLE public.reglas_costo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reglas_costo_all" ON public.reglas_costo;
CREATE POLICY "reglas_costo_all"
  ON public.reglas_costo FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── 5) Foreign keys: permitir borrar insumo sin 400 ─────────────────────────
-- pedido_items_insumos: insumo opcional, SET NULL al borrar insumo
ALTER TABLE public.pedido_items_insumos
  DROP CONSTRAINT IF EXISTS pedido_items_insumos_insumo_id_fkey;
ALTER TABLE public.pedido_items_insumos
  ALTER COLUMN insumo_id DROP NOT NULL;
ALTER TABLE public.pedido_items_insumos
  ADD CONSTRAINT pedido_items_insumos_insumo_id_fkey
  FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE SET NULL;

-- stock_movimientos: al borrar insumo, borrar movimientos (histórico de ese insumo)
ALTER TABLE public.stock_movimientos
  DROP CONSTRAINT IF EXISTS stock_movimientos_insumo_id_fkey;
ALTER TABLE public.stock_movimientos
  ADD CONSTRAINT stock_movimientos_insumo_id_fkey
  FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE CASCADE;

-- recetas_items: al borrar insumo, borrar línea de receta
ALTER TABLE public.recetas_items
  DROP CONSTRAINT IF EXISTS recetas_items_insumo_id_fkey;
ALTER TABLE public.recetas_items
  ADD CONSTRAINT recetas_items_insumo_id_fkey
  FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE CASCADE;

-- insumos_precios_log
ALTER TABLE public.insumos_precios_log
  DROP CONSTRAINT IF EXISTS insumos_precios_log_insumo_id_fkey;
ALTER TABLE public.insumos_precios_log
  ADD CONSTRAINT insumos_precios_log_insumo_id_fkey
  FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE CASCADE;

-- configuración tapas (11): SET NULL (nombres de FK pueden variar)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'configuracion_negocio'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%insumo_tapa%'
  LOOP
    EXECUTE format('ALTER TABLE public.configuracion_negocio DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.configuracion_negocio
  ADD CONSTRAINT configuracion_negocio_insumo_tapa_frontal_id_fkey
  FOREIGN KEY (insumo_tapa_frontal_id) REFERENCES public.insumos(id) ON DELETE SET NULL;
ALTER TABLE public.configuracion_negocio
  ADD CONSTRAINT configuracion_negocio_insumo_tapa_dorsal_id_fkey
  FOREIGN KEY (insumo_tapa_dorsal_id) REFERENCES public.insumos(id) ON DELETE SET NULL;

-- ── 6) RPC borrado: directo (sin validaciones duras) ─────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_insumo_fisico(p_insumo_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.insumos WHERE id = p_insumo_id;
$$;

COMMENT ON FUNCTION public.rpc_delete_insumo_fisico(uuid) IS
  'Borrado físico; FKs en cascada / SET NULL según tabla.';

-- ── 7) Costo tarifa: prioridad reglas_costo, si no recetas (insumo faltante = 0) ─
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
BEGIN
  SELECT * INTO pi FROM public.precios_impresion WHERE id = p_precio_impresion_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reglas_costo rc WHERE rc.precio_impresion_id = p_precio_impresion_id
  ) INTO v_tiene_reglas;

  IF v_tiene_reglas THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN rc.activo AND rc.insumo_id IS NOT NULL
          THEN public.fn_costo_unitario_insumo(rc.insumo_id) * rc.cantidad_usada
        ELSE 0
      END
    ), 0) INTO v_reglas
    FROM public.reglas_costo rc
    WHERE rc.precio_impresion_id = p_precio_impresion_id;

    IF v_reglas > 0 THEN
      RETURN round(v_reglas, 4);
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

-- ── 8) Tras cambiar costo de insumo: refrescar tarifas vía reglas o recetas ───
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

DROP TRIGGER IF EXISTS trg_insumos_refresh_tarifas_costo ON public.insumos;
CREATE TRIGGER trg_insumos_refresh_tarifas_costo
  AFTER UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_insumos_refresh_tarifas_costo();

CREATE OR REPLACE FUNCTION public.trg_reglas_refresh_tarifa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    pid := OLD.precio_impresion_id;
  ELSE
    pid := NEW.precio_impresion_id;
  END IF;
  IF pid IS NOT NULL THEN
    UPDATE public.precios_impresion p
    SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
    WHERE p.id = pid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reglas_refresh_tarifa ON public.reglas_costo;
CREATE TRIGGER trg_reglas_refresh_tarifa
  AFTER INSERT OR UPDATE OR DELETE ON public.reglas_costo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reglas_refresh_tarifa();
