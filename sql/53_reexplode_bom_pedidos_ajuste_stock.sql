-- ============================================================================
-- 53 — Reexplotar BOM de todos los pedidos + ajustar stock si ya se descontó
-- Requiere: 50 (rpc_explotar_bom_pedido actual)
--
-- Qué hace:
--   1) Por cada pedido: guarda consumos agregados por insumo (pedido_items_insumos).
--   2) Ejecuta rpc_explotar_bom_pedido (lógica actual: papel por hoja física, etc.).
--   3) Si el pedido tenía stock_descontado = true, corrige insumos.stock_actual
--      sumando (consumo_viejo − consumo_nuevo) por insumo.
--   4) Inserta en stock_movimientos (tipo ajuste, motivo ajuste_manual) un renglón
--      por insumo con delta ≠ 0, para que el historial refleje la corrección.
--
-- Efecto: pedidos históricos alineados con la función actual; stock más coherente
-- con esos consumos (puede quedar negativo; podés corregir después a mano).
--
-- Idempotencia: solo corre una vez (tabla _printmanager_migrations). Para repetir:
--   DELETE FROM public._printmanager_migrations WHERE key = '53_reexplode_bom_y_ajuste_stock';
--
-- Consulta en app: Insumos → Stock del insumo → sección “Historial de movimientos”.
-- Si ya ejecutaste una 53 antigua sin INSERT en stock_movimientos, el stock ya
-- está corregido: no insertes movimientos a mano con el mismo delta (duplicarías
-- el efecto). Opción segura: backup previo a la 53 y volver a ejecutar este script.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._printmanager_migrations (
  key text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $body$
DECLARE
  ped record;
  v_ins int;
BEGIN
  INSERT INTO public._printmanager_migrations (key)
  VALUES ('53_reexplode_bom_y_ajuste_stock')
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins = 0 THEN
    RAISE NOTICE 'Migración 53 ya aplicada: omitiendo (DELETE en _printmanager_migrations para forzar).';
    RETURN;
  END IF;

  CREATE TEMP TABLE snap_old (
    insumo_id uuid PRIMARY KEY,
    qty numeric NOT NULL
  );
  CREATE TEMP TABLE snap_new (
    insumo_id uuid PRIMARY KEY,
    qty numeric NOT NULL
  );
  CREATE TEMP TABLE m53_adj (
    insumo_id uuid PRIMARY KEY,
    adj numeric NOT NULL DEFAULT 0
  );

  FOR ped IN
    SELECT id, COALESCE(stock_descontado, false) AS sd
    FROM public.pedidos
    ORDER BY created_at NULLS LAST, id
  LOOP
    TRUNCATE snap_old;
    INSERT INTO snap_old
    SELECT pii.insumo_id, SUM(pii.cantidad)::numeric
    FROM public.pedido_items_insumos pii
    INNER JOIN public.pedido_items pi ON pi.id = pii.pedido_item_id
    WHERE pi.pedido_id = ped.id
      AND pii.insumo_id IS NOT NULL
    GROUP BY pii.insumo_id;

    PERFORM public.rpc_explotar_bom_pedido(ped.id);

    TRUNCATE snap_new;
    INSERT INTO snap_new
    SELECT pii.insumo_id, SUM(pii.cantidad)::numeric
    FROM public.pedido_items_insumos pii
    INNER JOIN public.pedido_items pi ON pi.id = pii.pedido_item_id
    WHERE pi.pedido_id = ped.id
      AND pii.insumo_id IS NOT NULL
    GROUP BY pii.insumo_id;

    IF ped.sd THEN
      INSERT INTO m53_adj (insumo_id, adj)
      SELECT sub.insumo_id, sub.d
      FROM (
        SELECT
          COALESCE(o.insumo_id, n.insumo_id) AS insumo_id,
          COALESCE(o.qty, 0::numeric) - COALESCE(n.qty, 0::numeric) AS d
        FROM snap_old o
        FULL OUTER JOIN snap_new n ON n.insumo_id = o.insumo_id
      ) sub
      ON CONFLICT (insumo_id) DO UPDATE
      SET adj = m53_adj.adj + EXCLUDED.adj;
    END IF;
  END LOOP;

  UPDATE public.insumos i
  SET stock_actual = COALESCE(i.stock_actual, 0) + a.adj
  FROM m53_adj a
  WHERE i.id = a.insumo_id;

  INSERT INTO public.stock_movimientos (
    insumo_id,
    tipo,
    cantidad,
    motivo,
    referencia_pedido_id,
    notas
  )
  SELECT
    a.insumo_id,
    'ajuste',
    a.adj,
    'ajuste_manual',
    NULL,
    'Migración 53: corrección de stock tras reexplotar BOM de todos los pedidos. '
      || 'Suma (consumo previo en PII − consumo nuevo) solo en pedidos con stock ya descontado. '
      || 'Unidades: hojas (papel), carillas (tóner), ml (tinta), según insumo.'
  FROM m53_adj a
  WHERE a.adj <> 0;

  RAISE NOTICE 'Migración 53: insumos con ajuste de stock = %, movimientos insertados = %',
    (SELECT count(*)::int FROM m53_adj),
    (SELECT count(*)::int FROM m53_adj WHERE adj <> 0);
END;
$body$;

COMMENT ON TABLE public._printmanager_migrations IS
  'Marcas de migraciones de datos (evitar doble ejecución).';
