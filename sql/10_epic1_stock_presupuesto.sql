-- ============================================================================
-- 10 — Épica 1: Presupuesto + vigencia, stock preventivo, rollback cancelación
-- Requiere: 01 (pedidos), 03 (insumos, stock_movimientos), 05 (pedido_items), 09
-- ============================================================================

-- ── 1) Pedido: modalidad presupuesto y vencimiento ───────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'pedido'
    CHECK (modalidad IN ('presupuesto', 'pedido')),
  ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;

COMMENT ON COLUMN public.pedidos.modalidad IS
  'presupuesto: cotización con vigencia; pedido: trabajo confirmado.';
COMMENT ON COLUMN public.pedidos.fecha_vencimiento IS
  'Fin de vigencia del presupuesto; se calcula al crear si modalidad = presupuesto.';

CREATE OR REPLACE FUNCTION public.trg_pedidos_set_vencimiento_presupuesto()
RETURNS TRIGGER AS $$
DECLARE
  dias integer;
BEGIN
  IF NEW.modalidad = 'presupuesto' AND NEW.fecha_vencimiento IS NULL THEN
    SELECT COALESCE(cn.dias_vigencia_presupuesto, 7)
    INTO dias
    FROM public.configuracion_negocio cn
    WHERE cn.id = 1;
    NEW.fecha_vencimiento := now() + (COALESCE(dias, 7) || ' days')::interval;
  END IF;
  IF NEW.modalidad = 'pedido' AND TG_OP = 'INSERT' THEN
    NEW.fecha_vencimiento := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_vencimiento ON public.pedidos;
CREATE TRIGGER trg_pedidos_vencimiento
  BEFORE INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pedidos_set_vencimiento_presupuesto();

-- ── 2) RPC: convertir presupuesto → pedido (bloquea si vencido) ─────────────
CREATE OR REPLACE FUNCTION public.rpc_convertir_presupuesto_a_pedido(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidad text;
  v_venc timestamptz;
BEGIN
  SELECT modalidad, fecha_vencimiento
  INTO v_modalidad, v_venc
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NO_ENCONTRADO';
  END IF;

  IF v_modalidad <> 'presupuesto' THEN
    RAISE EXCEPTION 'NO_ES_PRESUPUESTO';
  END IF;

  IF v_venc IS NOT NULL AND now() > v_venc THEN
    RAISE EXCEPTION 'PRESUPUESTO_VENCIDO: actualizá precios según costos vigentes y generá un nuevo presupuesto';
  END IF;

  UPDATE public.pedidos
  SET
    modalidad = 'pedido',
    fecha_vencimiento = NULL,
    estado = COALESCE(NULLIF(estado, ''), 'pendiente')
  WHERE id = p_pedido_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_convertir_presupuesto_a_pedido(uuid) IS
  'Pasa modalidad a pedido; falla si presupuesto venció.';

GRANT EXECUTE ON FUNCTION public.rpc_convertir_presupuesto_a_pedido(uuid) TO authenticated;

-- ── 3) Stock preventivo: descontar desde pedido_items_insumos ──────────────
CREATE OR REPLACE FUNCTION public.fn_aplicar_stock_preventivo(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = p_pedido_id AND COALESCE(p.stock_descontado, false)
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO n
  FROM public.pedido_items pi
  JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
  WHERE pi.pedido_id = p_pedido_id;

  IF n = 0 THEN
    RAISE EXCEPTION 'STOCK_SIN_CONSUMOS: generá consumos (pedido_items_insumos) antes de señar/confirmar';
  END IF;

  FOR r IN
    SELECT
      pii.insumo_id,
      sum(pii.cantidad)::numeric AS qty
    FROM public.pedido_items pi
    JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
    WHERE pi.pedido_id = p_pedido_id
    GROUP BY pii.insumo_id
  LOOP
    UPDATE public.insumos i
    SET stock_actual = i.stock_actual - r.qty
    WHERE i.id = r.insumo_id;

    INSERT INTO public.stock_movimientos (
      insumo_id, tipo, cantidad, motivo, referencia_pedido_id, notas
    ) VALUES (
      r.insumo_id,
      'salida',
      r.qty,
      'pedido',
      p_pedido_id,
      'Stock preventivo (Épica 1)'
    );
  END LOOP;

  UPDATE public.pedidos
  SET stock_descontado = true
  WHERE id = p_pedido_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_restaurar_stock_pedido(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT insumo_id, sum(cantidad)::numeric AS qty
    FROM public.stock_movimientos
    WHERE referencia_pedido_id = p_pedido_id
      AND motivo = 'pedido'
      AND tipo = 'salida'
    GROUP BY insumo_id
  LOOP
    UPDATE public.insumos i
    SET stock_actual = i.stock_actual + r.qty
    WHERE i.id = r.insumo_id;

    INSERT INTO public.stock_movimientos (
      insumo_id, tipo, cantidad, motivo, referencia_pedido_id, notas
    ) VALUES (
      r.insumo_id,
      'entrada',
      r.qty,
      'cancelacion',
      p_pedido_id,
      'Rollback stock por cancelación'
    );
  END LOOP;

  UPDATE public.pedidos
  SET stock_descontado = false
  WHERE id = p_pedido_id;
END;
$$;

-- Trigger en cambio de estado
CREATE OR REPLACE FUNCTION public.trg_pedidos_stock_preventivo()
RETURNS TRIGGER AS $$
BEGIN
  -- Descuento al pasar a señado o pagado (confirmación financiera / seña)
  IF NEW.estado IS DISTINCT FROM OLD.estado
    AND NEW.estado IN ('señado', 'pagado')
    AND COALESCE(NEW.stock_descontado, false) = false
    AND NEW.estado <> 'cancelado'
  THEN
    PERFORM public.fn_aplicar_stock_preventivo(NEW.id);
  END IF;

  -- Rollback al cancelar si ya se había descontado
  IF NEW.estado = 'cancelado'
    AND OLD.estado IS DISTINCT FROM 'cancelado'
    AND COALESCE(OLD.stock_descontado, false) = true
  THEN
    PERFORM public.fn_restaurar_stock_pedido(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_stock_estado ON public.pedidos;
CREATE TRIGGER trg_pedidos_stock_estado
  AFTER UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public.trg_pedidos_stock_preventivo();

COMMENT ON FUNCTION public.fn_aplicar_stock_preventivo(uuid) IS
  'Descuenta stock según pedido_items_insumos; idempotente con stock_descontado.';
COMMENT ON FUNCTION public.fn_restaurar_stock_pedido(uuid) IS
  'Revierte salidas de stock por pedido (cancelación).';

GRANT EXECUTE ON FUNCTION public.fn_aplicar_stock_preventivo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_restaurar_stock_pedido(uuid) TO authenticated;

-- Wrapper RPC (nombre de parámetro pedido_id = PostgREST / stockService.ts)
-- DROP obligatorio: CREATE OR REPLACE no puede renombrar parámetros en PG.
DROP FUNCTION IF EXISTS public.descontar_stock_pedido(uuid);
DROP FUNCTION IF EXISTS public.restaurar_stock_pedido(uuid);

CREATE FUNCTION public.descontar_stock_pedido(pedido_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_aplicar_stock_preventivo(pedido_id);
$$;

CREATE FUNCTION public.restaurar_stock_pedido(pedido_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_restaurar_stock_pedido(pedido_id);
$$;

GRANT EXECUTE ON FUNCTION public.descontar_stock_pedido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_stock_pedido(uuid) TO authenticated;
