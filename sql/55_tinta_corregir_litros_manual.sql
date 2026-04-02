-- ============================================================================
-- 55 — Corregir stock de tinta (ml en BD) cuando el listado mostraba números raros
--
-- El sistema guarda mililitros. Si ves ~163 L en pantalla pero tenés 5 L físicos,
-- ajustá el valor en Insumos → Editar → stock en litros, o ejecutá un UPDATE:
--
-- Ejemplo: fijar 5 litros = 5000 ml
-- UPDATE public.insumos
-- SET stock_actual = 5000, stock_minimo = LEAST(COALESCE(stock_minimo, 0), 5000)
-- WHERE id = 'UUID-DEL-INSUMO' AND categoria = 'tinta';
--
-- Si en el pasado corrió una migración antigua que infló tinta ×30, un técnico
-- puede evaluar dividir (solo con backup): stock_actual / 30
-- ============================================================================

SELECT 1;
