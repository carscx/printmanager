-- ============================================================================
-- 02 — Perfiles, JWT role, RLS sobre tablas del 01
-- Ejecutar DESPUÉS de crear al menos un usuario en Authentication (opcional pero recomendado).
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL DEFAULT 'operador',
  full_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  _role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.app_role,
    'operador'
  );
  _name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
    ''
  );

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, _role, NULLIF(_name, ''))
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.sync_role_to_jwt(NEW.id, _role);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'operador');
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados acceden a profiles" ON public.profiles;
CREATE POLICY "Autenticados acceden a profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

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

ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados acceden a config" ON public.config;
CREATE POLICY "Autenticados acceden a config"
  ON public.config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO public.profiles (id, role)
SELECT id, COALESCE((raw_user_meta_data ->> 'role')::public.app_role, 'operador')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, role FROM public.profiles LOOP
    PERFORM public.sync_role_to_jwt(r.id, r.role);
  END LOOP;
END $$;
