-- ============================================
-- FASE 3B: Equipos (impresoras) y amortización
-- ============================================

-- Tabla de equipos
CREATE TABLE IF NOT EXISTS equipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('inkjet', 'laser')),
  costo_adquisicion NUMERIC NOT NULL DEFAULT 0,
  fecha_adquisicion DATE,
  vida_util_meses INTEGER NOT NULL DEFAULT 36,
  costo_mantenimiento_mensual NUMERIC NOT NULL DEFAULT 0,
  paginas_mes_estimadas INTEGER NOT NULL DEFAULT 3000,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_equipos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_equipos_updated_at ON equipos;
CREATE TRIGGER trigger_equipos_updated_at
  BEFORE UPDATE ON equipos
  FOR EACH ROW
  EXECUTE FUNCTION update_equipos_updated_at();

-- RLS
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipos_select_auth" ON equipos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipos_insert_auth" ON equipos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "equipos_update_auth" ON equipos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "equipos_delete_auth" ON equipos
  FOR DELETE TO authenticated USING (true);
