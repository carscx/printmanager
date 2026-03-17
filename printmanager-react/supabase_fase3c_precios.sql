-- ============================================================================
-- FASE 3C — Precios de venta y motor de costos
-- ============================================================================
-- Ejecutar en Supabase SQL Editor (proyecto DEV)
-- ============================================================================

-- ── 1. TABLA: precios_impresion ─────────────────────────────────────────────

CREATE TABLE precios_impresion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('bn', 'color')),
  doble_faz BOOLEAN NOT NULL DEFAULT false,
  precio_venta NUMERIC NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(tipo, doble_faz)
);

ALTER TABLE precios_impresion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precios_impresion_select"
  ON precios_impresion FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "precios_impresion_all"
  ON precios_impresion FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Datos iniciales migrados desde config
INSERT INTO precios_impresion (tipo, doble_faz, precio_venta) VALUES
  ('bn',    false, (SELECT COALESCE(valor::numeric, 35)  FROM config WHERE id = 't_bn_s')),
  ('bn',    true,  (SELECT COALESCE(valor::numeric, 55)  FROM config WHERE id = 't_bn_d')),
  ('color', false, (SELECT COALESCE(valor::numeric, 70)  FROM config WHERE id = 't_col_s')),
  ('color', true,  (SELECT COALESCE(valor::numeric, 110) FROM config WHERE id = 't_col_d'));


-- ── 2. TABLA: precios_anillado ──────────────────────────────────────────────

CREATE TABLE precios_anillado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medida_mm INTEGER NOT NULL,
  paginas_max INTEGER,
  precio_venta NUMERIC NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(medida_mm)
);

ALTER TABLE precios_anillado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precios_anillado_select"
  ON precios_anillado FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "precios_anillado_all"
  ON precios_anillado FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Datos iniciales: mapeo desde config esp_s/m/l + medidas nuevas
INSERT INTO precios_anillado (medida_mm, paginas_max, precio_venta) VALUES
  (7,   30,  (SELECT COALESCE(valor::numeric, 700)  FROM config WHERE id = 'esp_s')),
  (9,   50,  (SELECT COALESCE(valor::numeric, 700)  FROM config WHERE id = 'esp_s')),
  (12,  70,  (SELECT COALESCE(valor::numeric, 700)  FROM config WHERE id = 'esp_s')),
  (14, 100,  (SELECT COALESCE(valor::numeric, 1000) FROM config WHERE id = 'esp_m')),
  (17, 130,  (SELECT COALESCE(valor::numeric, 1000) FROM config WHERE id = 'esp_m')),
  (20, 150,  (SELECT COALESCE(valor::numeric, 1000) FROM config WHERE id = 'esp_m')),
  (23, 200,  (SELECT COALESCE(valor::numeric, 1400) FROM config WHERE id = 'esp_l')),
  (25, 280,  (SELECT COALESCE(valor::numeric, 1400) FROM config WHERE id = 'esp_l')),
  (29, 350,  (SELECT COALESCE(valor::numeric, 1400) FROM config WHERE id = 'esp_l')),
  (33, 500,  (SELECT COALESCE(valor::numeric, 1800) FROM config WHERE id = 'esp_l'));


-- ── 3. TABLA: config_costos ─────────────────────────────────────────────────

CREATE TABLE config_costos (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE config_costos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_costos_select"
  ON config_costos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "config_costos_all"
  ON config_costos FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Valores iniciales migrados + nuevos
INSERT INTO config_costos (key, value, descripcion) VALUES
  ('markup_general',      (SELECT COALESCE(valor::numeric, 1.6) FROM config WHERE id = 'markup'),
                          'Divisor de ganancia bruta'),
  ('comision_sobrina',    (SELECT COALESCE(valor::numeric, 10) FROM config WHERE id = 'comision_sobrina'),
                          'Porcentaje de comisión para Avru');


-- ── 4. TABLA: pedido_items_insumos (consumo congelado) ──────────────────────

CREATE TABLE pedido_items_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id UUID NOT NULL REFERENCES pedido_items(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id),
  equipo_id UUID REFERENCES equipos(id),
  cantidad NUMERIC NOT NULL,
  costo_unitario_congelado NUMERIC NOT NULL,
  costo_total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pedido_items_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedido_items_insumos_select"
  ON pedido_items_insumos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "pedido_items_insumos_insert"
  ON pedido_items_insumos FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- ── 5. Trigger para updated_at automático ───────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Solo crear triggers si no existen ya (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_precios_impresion') THEN
    CREATE TRIGGER set_updated_at_precios_impresion
      BEFORE UPDATE ON precios_impresion
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_precios_anillado') THEN
    CREATE TRIGGER set_updated_at_precios_anillado
      BEFORE UPDATE ON precios_anillado
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_config_costos') THEN
    CREATE TRIGGER set_updated_at_config_costos
      BEFORE UPDATE ON config_costos
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
END $$;


-- ============================================================================
-- VERIFICACIÓN: Ejecutar después para comprobar
-- ============================================================================
-- SELECT * FROM precios_impresion;
-- SELECT * FROM precios_anillado ORDER BY medida_mm;
-- SELECT * FROM config_costos;
-- SELECT count(*) FROM pedido_items_insumos;  -- debería ser 0
-- ============================================================================
