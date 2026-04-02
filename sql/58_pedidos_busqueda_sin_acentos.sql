-- ============================================================================
-- 58 — Búsqueda de pedidos sin depender de tildes (cliente, observaciones, archivo)
-- Requiere: public.pedidos, public.pedido_items
--
-- La app normaliza el texto de búsqueda en TS con la misma lógica que esta
-- función y filtra por *_busqueda con ILIKE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalizar_texto_busqueda(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower(trim(coalesce(t, ''))),
    'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
    'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
  );
$$;

COMMENT ON FUNCTION public.normalizar_texto_busqueda(text) IS
  'Minúsculas y sin tildes (español) para búsqueda insensible a acentos.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pedidos'
      AND column_name = 'cliente_busqueda'
  ) THEN
    ALTER TABLE public.pedidos
      ADD COLUMN cliente_busqueda text
      GENERATED ALWAYS AS (public.normalizar_texto_busqueda(cliente)) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pedidos'
      AND column_name = 'observaciones_busqueda'
  ) THEN
    ALTER TABLE public.pedidos
      ADD COLUMN observaciones_busqueda text
      GENERATED ALWAYS AS (public.normalizar_texto_busqueda(observaciones)) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pedido_items'
      AND column_name = 'nombre_archivo_busqueda'
  ) THEN
    ALTER TABLE public.pedido_items
      ADD COLUMN nombre_archivo_busqueda text
      GENERATED ALWAYS AS (public.normalizar_texto_busqueda(nombre_archivo)) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_busqueda ON public.pedidos (cliente_busqueda);
CREATE INDEX IF NOT EXISTS idx_pedidos_obs_busqueda ON public.pedidos (observaciones_busqueda);
CREATE INDEX IF NOT EXISTS idx_pedido_items_nom_arch_busq ON public.pedido_items (nombre_archivo_busqueda);
