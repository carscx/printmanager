-- ============================================================================
-- 60 — Auditoría y corrección RLS (idempotente, sin borrar datos)
-- ============================================================================
-- Qué hace:
--   • Habilita Row Level Security en tablas public de PrintManager.
--   • Recrea políticas canónicas para rol `authenticated`.
--   • Revoca acceso del rol `anon` a tablas (defensa en profundidad).
--   • Otorga privilegios al rol `authenticated` (PostgREST / API con JWT).
--   • Informa tablas que sigan sin RLS o sin políticas.
--
-- Qué NO hace (garantía):
--   • Sin DELETE, TRUNCATE, DROP TABLE ni UPDATE de filas de negocio.
--   • No modifica pedidos, insumos, precios ni ningún dato existente.
--
-- Dónde ejecutar: SQL Editor de cada proyecto Supabase (dev y prod).
-- Requiere: esquema PrintManager (scripts 01–59). Idempotente: re-ejecutable.
-- ============================================================================

-- ── Helper de rol (necesario para políticas admin) ───────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'operador');
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados acceden a profiles" ON public.profiles;
CREATE POLICY "Autenticados acceden a profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── pedidos / pedido_items ───────────────────────────────────────────────────
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados acceden a pedidos" ON public.pedidos;
CREATE POLICY "Autenticados acceden a pedidos"
  ON public.pedidos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados acceden a items" ON public.pedido_items;
DROP POLICY IF EXISTS "Permitir todo a anon" ON public.pedido_items;
CREATE POLICY "Autenticados acceden a items"
  ON public.pedido_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── config ───────────────────────────────────────────────────────────────────
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados acceden a config" ON public.config;
CREATE POLICY "Autenticados acceden a config"
  ON public.config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── insumos / stock ──────────────────────────────────────────────────────────
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insumos_all_authenticated" ON public.insumos;
CREATE POLICY "insumos_all_authenticated" ON public.insumos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movimientos_all_authenticated" ON public.stock_movimientos;
CREATE POLICY "stock_movimientos_all_authenticated" ON public.stock_movimientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.insumos_precios_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insumos_precios_log_all_authenticated" ON public.insumos_precios_log;
CREATE POLICY "insumos_precios_log_all_authenticated" ON public.insumos_precios_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── equipos ──────────────────────────────────────────────────────────────────
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipos_select_auth" ON public.equipos;
DROP POLICY IF EXISTS "equipos_insert_auth" ON public.equipos;
DROP POLICY IF EXISTS "equipos_update_auth" ON public.equipos;
DROP POLICY IF EXISTS "equipos_delete_auth" ON public.equipos;
CREATE POLICY "equipos_select_auth" ON public.equipos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_insert_auth" ON public.equipos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "equipos_update_auth" ON public.equipos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "equipos_delete_auth" ON public.equipos
  FOR DELETE TO authenticated USING (true);

-- ── precios / config_costos / pedido_items_insumos ───────────────────────────
ALTER TABLE public.precios_impresion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "precios_impresion_select" ON public.precios_impresion;
DROP POLICY IF EXISTS "precios_impresion_all" ON public.precios_impresion;
CREATE POLICY "precios_impresion_select"
  ON public.precios_impresion FOR SELECT TO authenticated USING (true);
CREATE POLICY "precios_impresion_all"
  ON public.precios_impresion FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE public.precios_anillado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "precios_anillado_select" ON public.precios_anillado;
DROP POLICY IF EXISTS "precios_anillado_all" ON public.precios_anillado;
CREATE POLICY "precios_anillado_select"
  ON public.precios_anillado FOR SELECT TO authenticated USING (true);
CREATE POLICY "precios_anillado_all"
  ON public.precios_anillado FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE public.config_costos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_costos_select" ON public.config_costos;
DROP POLICY IF EXISTS "config_costos_all" ON public.config_costos;
CREATE POLICY "config_costos_select"
  ON public.config_costos FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_costos_all"
  ON public.config_costos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE public.pedido_items_insumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pedido_items_insumos_select" ON public.pedido_items_insumos;
DROP POLICY IF EXISTS "pedido_items_insumos_insert" ON public.pedido_items_insumos;
DROP POLICY IF EXISTS "select_pedido_items_insumos" ON public.pedido_items_insumos;
DROP POLICY IF EXISTS "insert_pedido_items_insumos" ON public.pedido_items_insumos;
CREATE POLICY "pedido_items_insumos_select"
  ON public.pedido_items_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "pedido_items_insumos_insert"
  ON public.pedido_items_insumos FOR INSERT TO authenticated WITH CHECK (true);

-- ── plantillas / log WhatsApp ────────────────────────────────────────────────
ALTER TABLE public.plantillas_whatsapp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_plantillas_whatsapp" ON public.plantillas_whatsapp;
DROP POLICY IF EXISTS "all_plantillas_whatsapp" ON public.plantillas_whatsapp;
CREATE POLICY "select_plantillas_whatsapp"
  ON public.plantillas_whatsapp FOR SELECT TO authenticated USING (true);
CREATE POLICY "all_plantillas_whatsapp"
  ON public.plantillas_whatsapp FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'operador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'operador')
    )
  );

ALTER TABLE public.mensajes_whatsapp_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_mensajes_whatsapp_log" ON public.mensajes_whatsapp_log;
DROP POLICY IF EXISTS "select_mensajes_whatsapp_log" ON public.mensajes_whatsapp_log;
CREATE POLICY "insert_mensajes_whatsapp_log"
  ON public.mensajes_whatsapp_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "select_mensajes_whatsapp_log"
  ON public.mensajes_whatsapp_log FOR SELECT TO authenticated USING (true);

-- ── configuracion_negocio / recetas / reglas ─────────────────────────────────
ALTER TABLE public.configuracion_negocio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracion_negocio_all" ON public.configuracion_negocio;
CREATE POLICY "configuracion_negocio_all"
  ON public.configuracion_negocio FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.recetas_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recetas_items_all" ON public.recetas_items;
CREATE POLICY "recetas_items_all"
  ON public.recetas_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.reglas_costo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reglas_costo_all" ON public.reglas_costo;
CREATE POLICY "reglas_costo_all"
  ON public.reglas_costo FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── gastos_fijos (tabla opcional según migraciones) ──────────────────────────
DO $gastos$
BEGIN
  IF to_regclass('public.gastos_fijos') IS NOT NULL THEN
    ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "gastos_fijos_select_auth" ON public.gastos_fijos;
    DROP POLICY IF EXISTS "gastos_fijos_insert_admin" ON public.gastos_fijos;
    DROP POLICY IF EXISTS "gastos_fijos_update_admin" ON public.gastos_fijos;
    DROP POLICY IF EXISTS "gastos_fijos_delete_admin" ON public.gastos_fijos;
    CREATE POLICY "gastos_fijos_select_auth"
      ON public.gastos_fijos FOR SELECT TO authenticated USING (true);
    CREATE POLICY "gastos_fijos_insert_admin"
      ON public.gastos_fijos FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() = 'admin');
    CREATE POLICY "gastos_fijos_update_admin"
      ON public.gastos_fijos FOR UPDATE TO authenticated
      USING (public.current_user_role() = 'admin')
      WITH CHECK (public.current_user_role() = 'admin');
    CREATE POLICY "gastos_fijos_delete_admin"
      ON public.gastos_fijos FOR DELETE TO authenticated
      USING (public.current_user_role() = 'admin');
  END IF;
END $gastos$;

-- ── toner_modelos (tabla opcional según migraciones) ─────────────────────────
DO $toner$
BEGIN
  IF to_regclass('public.toner_modelos') IS NOT NULL THEN
    ALTER TABLE public.toner_modelos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "toner_modelos_select_auth" ON public.toner_modelos;
    DROP POLICY IF EXISTS "toner_modelos_insert_admin" ON public.toner_modelos;
    DROP POLICY IF EXISTS "toner_modelos_update_admin" ON public.toner_modelos;
    DROP POLICY IF EXISTS "toner_modelos_delete_admin" ON public.toner_modelos;
    CREATE POLICY "toner_modelos_select_auth"
      ON public.toner_modelos FOR SELECT TO authenticated USING (true);
    CREATE POLICY "toner_modelos_insert_admin"
      ON public.toner_modelos FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() = 'admin');
    CREATE POLICY "toner_modelos_update_admin"
      ON public.toner_modelos FOR UPDATE TO authenticated
      USING (public.current_user_role() = 'admin')
      WITH CHECK (public.current_user_role() = 'admin');
    CREATE POLICY "toner_modelos_delete_admin"
      ON public.toner_modelos FOR DELETE TO authenticated
      USING (public.current_user_role() = 'admin');
  END IF;
END $toner$;

-- ── _printmanager_migrations: RLS sin políticas (solo uso interno / service_role)
DO $mig$
BEGIN
  IF to_regclass('public._printmanager_migrations') IS NOT NULL THEN
    ALTER TABLE public._printmanager_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._printmanager_migrations FROM anon;
    REVOKE ALL ON TABLE public._printmanager_migrations FROM authenticated;
  END IF;
END $mig$;

-- ── Revocar acceso anon a tablas (la app usa JWT de usuario autenticado) ─────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- ── Privilegios authenticated (equivalente a 30_grants_authenticated_public) ─
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Restaurar bloqueo de _printmanager_migrations tras GRANT masivo
DO $mig2$
BEGIN
  IF to_regclass('public._printmanager_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._printmanager_migrations FROM authenticated;
    REVOKE ALL ON TABLE public._printmanager_migrations FROM anon;
  END IF;
END $mig2$;

-- ── Habilitar RLS en cualquier tabla public que aún no lo tenga ──────────────
DO $enable$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    RAISE NOTICE '[60] RLS habilitado en public.%', r.tbl;
  END LOOP;
END $enable$;

-- ── Informe final (Messages en SQL Editor) ────────────────────────────────────
DO $audit$
DECLARE
  r RECORD;
  v_sin_rls int := 0;
  v_sin_pol int := 0;
BEGIN
  RAISE NOTICE '=== PrintManager 60_rls_audit_fix — informe ===';

  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
    ORDER BY 1
  LOOP
    v_sin_rls := v_sin_rls + 1;
    RAISE WARNING '[60] Tabla SIN RLS: public.%', r.tbl;
  END LOOP;

  FOR r IN
    SELECT t.tablename AS tbl
    FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = t.tablename
      )
    ORDER BY 1
  LOOP
    v_sin_pol := v_sin_pol + 1;
    IF r.tbl = '_printmanager_migrations' THEN
      RAISE NOTICE '[60] public.% sin políticas (esperado: bloqueada vía API)', r.tbl;
    ELSE
      RAISE WARNING '[60] Tabla SIN políticas RLS: public.%', r.tbl;
    END IF;
  END LOOP;

  IF v_sin_rls = 0 THEN
    RAISE NOTICE '[60] OK: todas las tablas public tienen RLS habilitado.';
  ELSE
    RAISE WARNING '[60] Quedan % tabla(s) sin RLS — revisar arriba.', v_sin_rls;
  END IF;

  RAISE NOTICE '[60] Fin. Refrescá Security Advisor en Supabase y probá login en la app.';
END $audit$;

NOTIFY pgrst, 'reload schema';
