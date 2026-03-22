-- ============================================================================
-- 28 — Máquina de estados unificada: stock al pasar a pendiente, vistas, RPC
-- Requiere: 10, 14, 15, 16, 23
-- ============================================================================
-- Estados: presupuesto → pendiente → listo → pagado → entregado | cancelado
-- Stock: solo trigger `trg_pedidos_stock_estado` al pasar de presupuesto a pendiente
--        (incluye migración desde presupuestado/señado legacy).

-- ── 1) Datos legacy ───────────────────────────────────────────────────────────
UPDATE public.pedidos SET estado = 'presupuesto' WHERE estado = 'presupuestado';
UPDATE public.pedidos SET estado = 'pendiente' WHERE estado = 'señado';

-- ── 2) RPC: al convertir presupuesto, estado = pendiente explícito ───────────
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
    estado = 'pendiente'
  WHERE id = p_pedido_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_convertir_presupuesto_a_pedido(uuid) IS
  'Pasa modalidad a pedido y estado a pendiente; falla si presupuesto venció.';

-- ── 3) Trigger stock: descuento al pasar a pendiente (desde presupuesto) ─────
CREATE OR REPLACE FUNCTION public.trg_pedidos_stock_preventivo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
    AND NEW.estado = 'pendiente'
    AND OLD.estado IN ('presupuesto', 'presupuestado')
    AND COALESCE(NEW.stock_descontado, false) = false
  THEN
    PERFORM public.fn_aplicar_stock_preventivo(NEW.id);
  END IF;

  IF NEW.estado = 'cancelado'
    AND OLD.estado IS DISTINCT FROM 'cancelado'
    AND COALESCE(OLD.stock_descontado, false) = true
  THEN
    PERFORM public.fn_restaurar_stock_pedido(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4) Validación BOM al pasar de presupuesto a pendiente ────────────────────
CREATE OR REPLACE FUNCTION public.trg_pedidos_validar_bom_antes_senado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
    AND NEW.estado = 'pendiente'
    AND OLD.estado IN ('presupuesto', 'presupuestado')
    AND COALESCE(OLD.estado, '') <> 'cancelado'
  THEN
    IF NOT public.fn_pedido_tiene_bom_completo(NEW.id) THEN
      RAISE EXCEPTION 'BOM_INCOMPLETO: ejecutá la explosión de materiales antes de confirmar (rpc_explotar_bom_pedido)';
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

COMMENT ON FUNCTION public.trg_pedidos_validar_bom_antes_senado() IS
  'Antes de presupuesto → pendiente: exige BOM completo.';

COMMENT ON COLUMN public.pedidos.estado IS
  'presupuesto | pendiente | listo | pagado | entregado | cancelado';

-- ── 5) Vistas dashboard / comisiones (estados operativos alineados al flujo nuevo)
DROP VIEW IF EXISTS public.v_estadisticas_diarias CASCADE;

CREATE VIEW public.v_estadisticas_diarias AS
WITH base AS (
  SELECT
    p.id AS pedido_id,
    (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
    COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
  FROM public.pedidos p
  WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
),
venta_items AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
  FROM public.pedido_items pi
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
costos AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pii.costo_total, 0))::numeric AS costo_insumos
  FROM public.pedido_items pi
  INNER JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
por_pedido AS (
  SELECT
    b.dia,
    b.pedido_id,
    CASE
      WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
      ELSE COALESCE(b.total_cabecera, 0)
    END AS venta,
    COALESCE(c.costo_insumos, 0)::numeric AS costo,
    COALESCE(p.comision_monto, 0)::numeric AS comision
  FROM base b
  LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
  LEFT JOIN costos c ON c.pedido_id = b.pedido_id
  INNER JOIN public.pedidos p ON p.id = b.pedido_id
)
SELECT
  dia,
  SUM(venta)::numeric AS total_ingresos,
  SUM(costo)::numeric AS total_insumos,
  SUM(comision)::numeric AS total_comisiones,
  (SUM(venta) - SUM(costo) - SUM(comision))::numeric AS ganancia_neta,
  CASE
    WHEN SUM(venta) > 0 THEN
      ROUND(
        ((SUM(venta) - SUM(costo) - SUM(comision)) / NULLIF(SUM(venta), 0) * 100)::numeric,
        2
      )
    ELSE 0::numeric
  END AS pct_margen_real
FROM por_pedido
GROUP BY dia;

COMMENT ON VIEW public.v_estadisticas_diarias IS
  'Por día (AR): ingresos, insumos BOM, comisiones; pedidos pendiente/pagado/listo/entregado.';

GRANT SELECT ON public.v_estadisticas_diarias TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_dashboard_ranking_vendedores(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  vendedor_id uuid,
  nombre text,
  ventas_totales numeric,
  comision_acumulada numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      p.id AS pedido_id,
      p.vendedor_id,
      (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
      COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
    FROM public.pedidos p
    WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
      AND p.vendedor_id IS NOT NULL
      AND (timezone('America/Argentina/Buenos_Aires', p.created_at))::date
        BETWEEN p_desde AND p_hasta
  ),
  venta_items AS (
    SELECT
      pi.pedido_id,
      SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
    FROM public.pedido_items pi
    INNER JOIN base b ON b.pedido_id = pi.pedido_id
    GROUP BY pi.pedido_id
  ),
  por_pedido AS (
    SELECT
      b.vendedor_id,
      CASE
        WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
        ELSE COALESCE(b.total_cabecera, 0)
      END AS venta,
      COALESCE(p.comision_monto, 0)::numeric AS comision
    FROM base b
    LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
    INNER JOIN public.pedidos p ON p.id = b.pedido_id
  )
  SELECT
    pp.vendedor_id,
    COALESCE(NULLIF(TRIM(pr.full_name), ''), pr.id::text)::text AS nombre,
    SUM(pp.venta)::numeric AS ventas_totales,
    SUM(pp.comision)::numeric AS comision_acumulada
  FROM por_pedido pp
  INNER JOIN public.profiles pr ON pr.id = pp.vendedor_id
  GROUP BY pp.vendedor_id, pr.id, pr.full_name
  ORDER BY SUM(pp.venta) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.fn_dashboard_ranking_vendedores(date, date) IS
  'Ventas y comisiones por vendedor (pendiente/pagado/listo/entregado).';

GRANT EXECUTE ON FUNCTION public.fn_dashboard_ranking_vendedores(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_dashboard_top_productos_margen(
  p_desde date,
  p_hasta date,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  producto text,
  margen_neto numeric,
  venta_total numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lineas AS (
    SELECT
      COALESCE(
        NULLIF(TRIM(pi.nombre_archivo), ''),
        CONCAT(
          COALESCE(pi.tipo_impresion, 'item'),
          ' · ',
          COALESCE(pi.anillado, '—')
        )
      ) AS lbl,
      COALESCE(pi.subtotal_item, 0)::numeric AS v,
      COALESCE((
        SELECT SUM(pii.costo_total)
        FROM public.pedido_items_insumos pii
        WHERE pii.pedido_item_id = pi.id
      ), 0)::numeric AS c
    FROM public.pedido_items pi
    INNER JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
      AND (timezone('America/Argentina/Buenos_Aires', p.created_at))::date
        BETWEEN p_desde AND p_hasta
  )
  SELECT
    lineas.lbl AS producto,
    SUM(lineas.v - lineas.c)::numeric AS margen_neto,
    SUM(lineas.v)::numeric AS venta_total
  FROM lineas
  GROUP BY lineas.lbl
  ORDER BY SUM(lineas.v - lineas.c) DESC NULLS LAST
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
$$;

DROP VIEW IF EXISTS public.v_rendimiento_vendedores CASCADE;

CREATE VIEW public.v_rendimiento_vendedores AS
WITH base AS (
  SELECT
    p.id AS pedido_id,
    p.vendedor_id,
    COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
  FROM public.pedidos p
  WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
    AND p.vendedor_id IS NOT NULL
),
venta_items AS (
  SELECT
    pi.pedido_id,
    SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
  FROM public.pedido_items pi
  INNER JOIN base b ON b.pedido_id = pi.pedido_id
  GROUP BY pi.pedido_id
),
por_pedido AS (
  SELECT
    b.pedido_id,
    b.vendedor_id,
    CASE
      WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
      ELSE COALESCE(b.total_cabecera, 0)
    END AS venta,
    COALESCE(p.comision_monto, 0)::numeric AS comision
  FROM base b
  LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
  INNER JOIN public.pedidos p ON p.id = b.pedido_id
),
agg AS (
  SELECT
    vendedor_id,
    COUNT(DISTINCT pedido_id)::bigint AS pedidos,
    SUM(venta)::numeric AS total_facturado,
    SUM(comision)::numeric AS comision_acumulada
  FROM por_pedido
  GROUP BY vendedor_id
)
SELECT
  a.vendedor_id,
  COALESCE(NULLIF(TRIM(pr.full_name), ''), pr.id::text)::text AS nombre,
  a.pedidos,
  a.total_facturado,
  a.comision_acumulada
FROM agg a
INNER JOIN public.profiles pr ON pr.id = a.vendedor_id
ORDER BY a.total_facturado DESC NULLS LAST;

COMMENT ON VIEW public.v_rendimiento_vendedores IS
  'Por vendedor: pedidos pendiente/pagado/listo/entregado, total y comisión.';

GRANT SELECT ON public.v_rendimiento_vendedores TO authenticated;
