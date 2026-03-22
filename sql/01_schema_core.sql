-- ============================================================================
-- 01 — Núcleo: config, pedidos, pedido_items (proyecto nuevo desde cero)
-- ============================================================================

-- Config legacy (precios en texto; useConfig / calculadora)
CREATE TABLE IF NOT EXISTS public.config (
  id    TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Cabecera de pedido
CREATE TABLE IF NOT EXISTS public.pedidos (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente                    TEXT NOT NULL DEFAULT '',
  estado                     TEXT NOT NULL DEFAULT 'pendiente',
  total                      NUMERIC NOT NULL DEFAULT 0,
  sena                       NUMERIC NOT NULL DEFAULT 0,
  fecha_entrega              DATE,
  observaciones              TEXT DEFAULT '',
  entregado                  BOOLEAN NOT NULL DEFAULT false,
  fecha_pago                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo_pago                  TEXT,
  stock_descontado           BOOLEAN NOT NULL DEFAULT false,
  descuento_global_porcentaje NUMERIC,
  descuento_global_monto      NUMERIC,
  recargo_global_porcentaje   NUMERIC,
  recargo_global_monto        NUMERIC,
  total_pedido               NUMERIC DEFAULT 0,
  -- Legacy (nullable; la app usa sobre todo pedido_items)
  paginas                    INTEGER DEFAULT 0,
  tipo_tinta                 TEXT,
  doble_faz                  BOOLEAN DEFAULT false,
  anillado_costo             NUMERIC DEFAULT 0
);

-- Líneas del pedido (estructura actual de la app)
CREATE TABLE IF NOT EXISTS public.pedido_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id             UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  nombre_archivo        TEXT,
  paginas               INTEGER DEFAULT 0,
  copias                INTEGER DEFAULT 1,
  tipo_impresion        TEXT,
  anillado              TEXT,
  precio_unitario       NUMERIC DEFAULT 0,
  observaciones         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  descuento_porcentaje NUMERIC,
  descuento_monto      NUMERIC,
  recargo_porcentaje   NUMERIC,
  recargo_monto        NUMERIC,
  -- Legacy opcional
  tipo_tinta            TEXT DEFAULT 'bn',
  doble_faz             BOOLEAN DEFAULT false,
  anillado_costo        NUMERIC DEFAULT 0,
  subtotal_item         NUMERIC DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_id ON public.pedido_items(pedido_id);
