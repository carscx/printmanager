-- ============================================================================
-- 27 — Borrar insumos papel / tóner / tinta y alinear costo unitario (tinta = ml)
-- Requiere: 23 (o esquema ya con fn_costo_unitario_insumo)
-- ============================================================================
-- Maestros de negocio:
--   - Resma: 500 hojas
--   - Cartucho tóner: 1800 páginas
--   - Tinta: 30 páginas por ml de depósito; precio_compra = $/litro
--     costo/página impresa = (precio_litro / 1000) / páginas_por_ml
--
-- Al borrar: recetas CASCADE; stock_movimientos / precios_log CASCADE;
-- reglas_costo y pedido_items_insumos → insumo_id NULL (FKs 20+).

DELETE FROM public.insumos
WHERE categoria IN ('papel', 'tinta', 'toner');

COMMENT ON COLUMN public.insumos.rendimiento IS
  'Papel: hojas por resma; tóner: páginas por cartucho; tinta: páginas impresas por ml (stock en ml; precio compra $/litro).';

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
              GREATEST(COALESCE(NULLIF(i.rendimiento, 0), 30), 1)::numeric,
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
  'Costo por unidad de consumo: tinta = (precio litro) / (1000 * páginas/ml); papel/tóner = precio/rendimiento o maestros 500/1800.';
