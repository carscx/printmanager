-- ============================================================
-- FASE 1 — Custom Claims + Profiles + RLS
-- Ejecutar en Supabase Dashboard → SQL Editor (en orden)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. ENUM de roles
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 1. Tabla profiles vinculada a auth.users
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL DEFAULT 'operador',
  full_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. Función auxiliar: sincroniza el role en app_metadata del JWT
--    Esto es la clave para que auth.jwt()->'app_metadata'->>'role'
--    esté siempre actualizado.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_role_to_jwt(user_id UUID, new_role public.app_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new_role::text)
  WHERE id = user_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Trigger: al crear un usuario en auth.users → crear perfil
--    + inyectar role en app_metadata
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
  _name TEXT;
BEGIN
  -- Tomar role de raw_user_meta_data si viene, sino 'operador'
  _role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.app_role,
    'operador'
  );
  _name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, _role, _name)
  ON CONFLICT (id) DO NOTHING;

  -- Sincronizar role al app_metadata del JWT
  PERFORM public.sync_role_to_jwt(NEW.id, _role);

  RETURN NEW;
END;
$$;

-- Crear trigger solo si no existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 4. Trigger: al actualizar role en profiles → sincronizar JWT
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.sync_role_to_jwt(NEW.id, NEW.role);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_role_changed ON public.profiles;
CREATE TRIGGER on_profile_role_changed
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_role_change();

-- ────────────────────────────────────────────────────────────
-- 5. Helper SQL para consultar el role desde el JWT (comodidad)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'operador'
  );
$$;

-- ────────────────────────────────────────────────────────────
-- 6. RLS en profiles
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios leen su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Admin lee todos los perfiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admin actualiza perfiles"       ON public.profiles;

-- Todos los autenticados pueden leer y editar perfiles
CREATE POLICY "Autenticados acceden a profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 7. RLS en pedidos
-- ────────────────────────────────────────────────────────────
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados leen pedidos"   ON pedidos;
DROP POLICY IF EXISTS "Usuarios autenticados crean pedidos"  ON pedidos;
DROP POLICY IF EXISTS "Usuarios autenticados actualizan pedidos" ON pedidos;
DROP POLICY IF EXISTS "Admin borra pedidos"                  ON pedidos;
DROP POLICY IF EXISTS "Autenticados leen pedidos"            ON pedidos;
DROP POLICY IF EXISTS "Autenticados crean pedidos"           ON pedidos;
DROP POLICY IF EXISTS "Autenticados actualizan pedidos"      ON pedidos;

CREATE POLICY "Autenticados acceden a pedidos"
  ON pedidos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 8. RLS en pedido_items
-- ────────────────────────────────────────────────────────────
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados leen items"      ON pedido_items;
DROP POLICY IF EXISTS "Usuarios autenticados crean items"     ON pedido_items;
DROP POLICY IF EXISTS "Usuarios autenticados actualizan items" ON pedido_items;
DROP POLICY IF EXISTS "Admin borra items"                     ON pedido_items;
DROP POLICY IF EXISTS "Autenticados leen items"               ON pedido_items;
DROP POLICY IF EXISTS "Autenticados crean items"              ON pedido_items;
DROP POLICY IF EXISTS "Autenticados actualizan items"         ON pedido_items;

CREATE POLICY "Autenticados acceden a items"
  ON pedido_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 9. RLS en config
-- ────────────────────────────────────────────────────────────
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados leen config" ON config;
DROP POLICY IF EXISTS "Admin modifica config"             ON config;
DROP POLICY IF EXISTS "Admin inserta config"              ON config;
DROP POLICY IF EXISTS "Autenticados leen config"          ON config;

CREATE POLICY "Autenticados acceden a config"
  ON config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 10. Migrar usuarios existentes (si ya existen en auth.users)
--     Esto crea filas en profiles y sincroniza app_metadata
-- ────────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, role)
SELECT
  id,
  COALESCE((raw_user_meta_data ->> 'role')::public.app_role, 'operador')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Sincronizar app_metadata para usuarios existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, role FROM public.profiles
  LOOP
    PERFORM public.sync_role_to_jwt(r.id, r.role);
  END LOOP;
END $$;

-- ============================================================
-- CREAR USUARIOS DESDE EL DASHBOARD
-- Supabase Dashboard → Authentication → Users → Add User
--
-- Admin:
--   Email: admin@gestionmoni.com
--   Password: (elegir una segura)
--   User Metadata: { "role": "admin" }
--
-- Operador:
--   Email: operador@gestionmoni.com
--   Password: (elegir una segura)
--   User Metadata: { "role": "operador" }
--
-- El trigger se encarga de crear el perfil y escribir el role
-- en app_metadata del JWT automáticamente.
-- ============================================================
