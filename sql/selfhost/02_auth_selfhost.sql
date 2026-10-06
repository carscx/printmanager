-- ============================================================================
-- 02 self-host — profiles sin RLS ni auth.users de Supabase
-- Reemplaza sql/02_auth_rls.sql en instalaciones propias.
-- Requiere: 00_bootstrap.sql (public.users + auth.users stub)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL DEFAULT 'operador',
  full_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mantener auth.users en sync para FKs legacy (updated_by, etc.)
CREATE OR REPLACE FUNCTION public.sync_user_to_auth_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.password_hash,
    NEW.raw_user_meta_data,
    NEW.raw_app_meta_data
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_auth ON public.users;
CREATE TRIGGER trg_users_sync_auth
  AFTER INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_to_auth_users();

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
  BEGIN
    _role := COALESCE(
      (NEW.raw_user_meta_data ->> 'role')::public.app_role,
      (NEW.raw_app_meta_data ->> 'role')::public.app_role,
      'operador'
    );
  EXCEPTION WHEN others THEN
    _role := 'operador';
  END;

  _name := COALESCE(
    NULLIF(TRIM(NEW.full_name), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
    ''
  );

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, _role, NULLIF(_name, ''))
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_public_user_created ON public.users;
CREATE TRIGGER on_public_user_created
  AFTER INSERT ON public.users
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
    UPDATE public.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', NEW.role::text),
        updated_at = now()
    WHERE id = NEW.id;
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
  SELECT 'operador'::text;
$$;

-- RLS se desactiva al final en 99_disable_rls.sql (tras crear tablas).
