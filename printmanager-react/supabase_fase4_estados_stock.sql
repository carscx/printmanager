-- ============================================================================
-- FASE 4 — Estados de pedido y stock automático + WhatsApp
-- Ejecutar en Supabase DEV
-- ============================================================================

-- 1. Migrar estados y campos en pedidos
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tipo_pago TEXT,
  ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT false;

-- Cambiar valores de estado a los nuevos (si es necesario)
-- 'Pendiente' → 'pendiente', 'Listo' → 'entregado'
UPDATE pedidos SET estado = 'pendiente' WHERE estado = 'Pendiente';
UPDATE pedidos SET estado = 'entregado' WHERE estado = 'Listo';

-- 2. Tabla para congelar insumos consumidos por item
CREATE TABLE IF NOT EXISTS pedido_items_insumos (
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
CREATE POLICY "select_pedido_items_insumos" ON pedido_items_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_pedido_items_insumos" ON pedido_items_insumos FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Tabla de plantillas WhatsApp
CREATE TABLE IF NOT EXISTS plantillas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado_destino TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  incluir_datos_pago BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE plantillas_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_plantillas_whatsapp" ON plantillas_whatsapp FOR SELECT TO authenticated USING (true);
CREATE POLICY "all_plantillas_whatsapp" ON plantillas_whatsapp FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 4. Seed de plantillas por defecto
INSERT INTO plantillas_whatsapp (estado_destino, nombre, cuerpo, incluir_datos_pago, activo, orden)
VALUES
  ('presupuesto', 'Presupuesto', 'Hola {{cliente}}, te paso el presupuesto:\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPagos:\nAlias: _{{alias_pago}}_', true, true, 1),
  ('señado', 'Confirmación de seña', 'Hola {{cliente}}, recibimos tu seña de _{{sena}}_.\nResta: _{{resta}}_\n\nTe avisamos cuando esté listo!', true, true, 2),
  ('pagado', 'Pago registrado', 'Hola {{cliente}}, tu pago de _{{total}}_ fue registrado. Te avisamos cuando esté listo!', false, true, 3),
  ('entregado', 'Pedido listo', 'Hola {{cliente}}, tu pedido está listo para retirar 🎉\n\n{{detalle}}', false, true, 4),
  ('cancelado', 'Pedido cancelado', 'Hola {{cliente}}, tu pedido fue cancelado. Si tenías seña, coordinamos la devolución.', true, true, 5);

-- 5. Datos de pago (en config_costos o tabla dedicada)
INSERT INTO config_costos (key, value, descripcion)
  VALUES
    ('pago_alias', '', 'Alias de mercadopago/transferencia'),
    ('pago_cbu', '', 'CBU completo'),
    ('pago_titular', '', 'Nombre del titular'),
    ('pago_banco', '', 'Nombre del banco')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- VERIFICACIÓN
-- SELECT * FROM pedidos LIMIT 10;
-- SELECT * FROM pedido_items_insumos LIMIT 10;
-- SELECT * FROM plantillas_whatsapp;
-- SELECT * FROM config_costos WHERE key LIKE 'pago_%';
-- ============================================================================