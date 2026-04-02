-- ============================================================================
-- 51 — Tinta ~30 pág/ml (~1 ml / 30 hojas); tóner ~1000 pág/cartucho (~5 % cob.)
-- Requiere: 50 (rpc_explotar_bom_pedido), 49 (fn_normalizar tinta)
--
-- Alinea maestros con uso real (texto / ISO aprox.) y costo $/página. Tinta:
-- stock sigue en ml; solo cambia páginas/ml por defecto (25→30). Tóner: stock
-- en “carillas” se escala ×(1000/1800) al pasar de 1800→1000 pág/cartucho para
-- conservar el mismo inventario físico (mismos cartuchos ≈ mismas hojas útiles).
-- ============================================================================

-- ── 1) Costo unitario: tinta default 30 pág/ml; tóner fallback 1000 pág/cartucho
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
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0) / 1000::numeric
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
  'Costo por unidad de consumo: tinta = (precio litro) / (1000 × páginas/ml); tóner sin rendimiento = ÷1000 pág/cartucho.';

-- ── 2) Normalizar PII: tinta default 30 páginas por ml ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_normalizar_cantidad_stock_pii(
  p_insumo_id uuid,
  p_qty numeric,
  p_cuo numeric
)
RETURNS TABLE(o_qty numeric, o_cuo numeric, o_ct numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN i.categoria = 'tinta' THEN
        p_qty / GREATEST(
          COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
          1::numeric
        )
      ELSE p_qty
    END,
    CASE
      WHEN i.categoria = 'tinta' THEN
        p_cuo * GREATEST(
          COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
          1::numeric
        )
      ELSE p_cuo
    END,
    round(
      (CASE
        WHEN i.categoria = 'tinta' THEN
          p_qty / GREATEST(
            COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
            1::numeric
          )
        ELSE p_qty
      END) *
      (CASE
        WHEN i.categoria = 'tinta' THEN
          p_cuo * GREATEST(
            COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
            1::numeric
          )
        ELSE p_cuo
      END),
      4
    )
  FROM public.insumos i
  WHERE i.id = p_insumo_id
  UNION ALL
  SELECT p_qty, p_cuo, round(p_qty * p_cuo, 4)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.insumos j WHERE j.id = p_insumo_id
  );
$$;

COMMENT ON FUNCTION public.fn_normalizar_cantidad_stock_pii(uuid, numeric, numeric) IS
  'Tinta: cantidad lógica (× carillas) → ml; costo congelado $/ml. Default 30 pág/ml.';

-- ── 3) Datos: tinta 25→30; tóner 1800→1000 con escala de stock en carillas ───
UPDATE public.insumos
SET rendimiento = 30
WHERE categoria = 'tinta'
  AND (rendimiento IS NULL OR rendimiento <= 0 OR rendimiento = 25);

UPDATE public.insumos
SET
  stock_actual = GREATEST(
    0::numeric,
    round(
      (
        stock_actual::numeric * (1000.0 / GREATEST(
          COALESCE(NULLIF(rendimiento, 0), 1800)::numeric,
          1::numeric
        ))
      )::numeric,
      4
    )
  ),
  stock_minimo = GREATEST(
    0::numeric,
    round(
      (
        stock_minimo::numeric * (1000.0 / GREATEST(
          COALESCE(NULLIF(rendimiento, 0), 1800)::numeric,
          1::numeric
        ))
      )::numeric,
      4
    )
  ),
  rendimiento = 1000
WHERE categoria = 'toner'
  AND (rendimiento IS NULL OR rendimiento <= 0 OR rendimiento = 1800);
