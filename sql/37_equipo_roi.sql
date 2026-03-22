-- ============================================================================
-- 37 — ROI por equipo: tarifa de impresión → equipo, vista de ganancia acumulada
-- Requiere: equipos, precios_impresion, pedidos, pedido_items, pedido_items_insumos,
--           configuracion_negocio (id=1).
-- ============================================================================
--
-- GAP (documentación): en `pedido_items_insumos` la columna `equipo_id` existe pero
-- la RPC `rpc_explotar_bom_pedido` inserta hoy solo líneas de insumo con `equipo_id`
-- NULL. El ROI se atribuye vía `precios_impresion.equipo_id` → ítems con esa tarifa.
-- Asigná el equipo en Precios (tarifa) para que la vista sume ventas.
--
-- Ganancia por línea (ítems con impresión, pedido entregado o pagado):
--   subtotal_item
--   − SUM(pii.costo_total WHERE insumo_id IS NOT NULL) × (1 + pct_desperdicio/100)
--   − costo operativo equipo: (amortización mensual + mant. ajustado) / págs_mes × págs × copias
--     amortización mensual = costo_adquisicion / vida_util_meses
--     mant. ajustado = costo_mantenimiento_mensual × (1 + pct_mantenimiento_maquinas/100)
-- ============================================================================

ALTER TABLE public.precios_impresion
  ADD COLUMN IF NOT EXISTS equipo_id uuid REFERENCES public.equipos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_precios_impresion_equipo_id
  ON public.precios_impresion (equipo_id)
  WHERE equipo_id IS NOT NULL;

COMMENT ON COLUMN public.precios_impresion.equipo_id IS
  'Equipo al que se atribuye ROI / costo operativo para ítems que usan esta tarifa de impresión.';

-- Vista: una fila por equipo (incluye equipos sin ventas atribuidas)
CREATE OR REPLACE VIEW public.v_equipo_resumen_roi AS
WITH ins AS (
  SELECT
    pedido_item_id,
    SUM(costo_total)::numeric AS costo_insumos
  FROM public.pedido_items_insumos
  WHERE insumo_id IS NOT NULL
  GROUP BY pedido_item_id
),
lineas AS (
  SELECT
    pri.equipo_id,
    (
      COALESCE(pi.subtotal_item, 0)::numeric
      - COALESCE(ins.costo_insumos, 0) * (
          1 + (
            SELECT COALESCE(cn.pct_desperdicio, 5::numeric)
            FROM public.configuracion_negocio cn
            WHERE cn.id = 1
          ) / 100.0
        )
      - (
          (
            (e.costo_adquisicion / NULLIF(e.vida_util_meses, 0))
            + e.costo_mantenimiento_mensual * (
                1 + (
                  SELECT COALESCE(cn.pct_mantenimiento_maquinas, 10::numeric)
                  FROM public.configuracion_negocio cn
                  WHERE cn.id = 1
                ) / 100.0
              )
          )
          / NULLIF(e.paginas_mes_estimadas, 0)
        )
        * GREATEST(COALESCE(pi.paginas, 0), 0)::numeric
        * GREATEST(COALESCE(pi.copias, 1), 1)::numeric
    ) AS ganancia_linea
  FROM public.pedidos p
  INNER JOIN public.pedido_items pi ON pi.pedido_id = p.id
  INNER JOIN public.precios_impresion pri ON pri.id = pi.precio_impresion_id
  INNER JOIN public.equipos e ON e.id = pri.equipo_id
  LEFT JOIN ins ON ins.pedido_item_id = pi.id
  WHERE lower(trim(p.estado)) IN ('entregado', 'pagado')
    AND COALESCE(pi.solo_anillado, false) = false
    AND pri.equipo_id IS NOT NULL
)
SELECT
  e.id AS equipo_id,
  e.nombre AS equipo_nombre,
  e.costo_adquisicion::numeric AS costo_adquisicion,
  COALESCE(SUM(l.ganancia_linea), 0)::numeric AS ganancia_acumulada,
  CASE
    WHEN e.costo_adquisicion > 0 THEN
      ROUND(
        COALESCE(SUM(l.ganancia_linea), 0) / e.costo_adquisicion * 100,
        2
      )
    ELSE NULL
  END AS ratio_recuperacion_pct
FROM public.equipos e
LEFT JOIN lineas l ON l.equipo_id = e.id
GROUP BY e.id, e.nombre, e.costo_adquisicion;

COMMENT ON VIEW public.v_equipo_resumen_roi IS
  'Ganancia neta acumulada por equipo (pedidos entregado/pagado) vs costo de adquisición; requiere precios_impresion.equipo_id.';

GRANT SELECT ON public.v_equipo_resumen_roi TO authenticated;
