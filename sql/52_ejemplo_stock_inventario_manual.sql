-- ============================================================================
-- 52 — EJEMPLO: ajustar stock manual (tóner, tinta, papel) — editar y ejecutar
-- No se ejecuta solo: reemplazá UUIDs o nombres según tu catálogo.
--
-- Referencia (tu inventario declarado):
--   • 3 cartuchos tóner llenos + 0,5 → 3,5 × rendimiento (p. ej. 1000 carillas/cart)
--   • 5 litros tinta → 5000 ml en BD
--   • 8 resmas A4 75g ≈ 4000 hojas (8 × 500)
-- ============================================================================

-- Opción A: ver insumos para copiar id
-- SELECT id, nombre, categoria, rendimiento, stock_actual FROM public.insumos
--   WHERE categoria IN ('papel', 'tinta', 'toner') AND activo
--   ORDER BY categoria, nombre;

-- Opción B: por nombre (revisá que sea único)
/*
UPDATE public.insumos
SET stock_actual = 3500,
    stock_minimo = COALESCE(stock_minimo, 0)
WHERE categoria = 'toner'
  AND nombre ILIKE '%P2509%'  -- ejemplo: ajustar
RETURNING id, nombre, stock_actual;

UPDATE public.insumos
SET stock_actual = 5000
WHERE categoria = 'tinta'
  AND nombre ILIKE '%color%'
RETURNING id, nombre, stock_actual;

UPDATE public.insumos
SET stock_actual = 4000
WHERE categoria = 'papel'
  AND nombre ILIKE '%A4%75%'
RETURNING id, nombre, stock_actual;
*/

-- Cálculo tóner (carillas en stock): cartuchos × páginas/cartucho del insumo
-- 3,5 × 1000 = 3500  (si rendimiento = 1000 en fila)
