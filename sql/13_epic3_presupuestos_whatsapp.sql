-- ============================================================================
-- 13 — Épica 3: Número público de pedido (#1024), estados operativos
-- NO modifica funciones de costos/BOM.
-- Requiere: 01 (pedidos), 10 (modalidad presupuesto)
-- ============================================================================

-- ID corto legible para operador y cliente (ej. #1024)
CREATE SEQUENCE IF NOT EXISTS public.pedidos_numero_publico_seq;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero_publico integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_numero_publico
  ON public.pedidos (numero_publico)
  WHERE numero_publico IS NOT NULL;

COMMENT ON COLUMN public.pedidos.numero_publico IS
  'Número correlativo legible (ej. 1024) para mostrar #1024 en UI y WhatsApp.';

CREATE OR REPLACE FUNCTION public.trg_pedidos_asignar_numero_publico()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_publico IS NULL THEN
    NEW.numero_publico := nextval('public.pedidos_numero_publico_seq')::integer;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_numero_publico ON public.pedidos;
CREATE TRIGGER trg_pedidos_numero_publico
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pedidos_asignar_numero_publico();

-- Backfill filas existentes (orden cronológico)
UPDATE public.pedidos p
SET numero_publico = s.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at)::integer AS n
  FROM public.pedidos
  WHERE numero_publico IS NULL
) s
WHERE p.id = s.id;

SELECT setval(
  'public.pedidos_numero_publico_seq',
  GREATEST(
    (SELECT COALESCE(MAX(numero_publico), 0) FROM public.pedidos),
    1
  )
);

-- Estados sugeridos (texto libre; la app usa valores en minúsculas):
-- presupuestado | pendiente | señado | pagado | listo | entregado | cancelado
COMMENT ON COLUMN public.pedidos.estado IS
  'Flujo: presupuestado → señado/pagado (reserva stock al señar, ver trigger en 10) → listo → entregado.';
