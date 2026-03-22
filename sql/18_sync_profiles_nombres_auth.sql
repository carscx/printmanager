-- ============================================================================
-- 18 — Sincronizar profiles.full_name con auth.users (user_metadata)
-- El dashboard de Supabase suele guardar el nombre en `name` / `display_name`,
-- no solo en `full_name`; el trigger original solo leía full_name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.display_name_from_auth_meta(meta jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(TRIM(meta ->> 'full_name'), ''),
    NULLIF(TRIM(meta ->> 'name'), ''),
    NULLIF(TRIM(meta ->> 'display_name'), ''),
    NULLIF(TRIM(meta ->> 'given_name'), '')
  );
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
  _name := public.display_name_from_auth_meta(COALESCE(NEW.raw_user_meta_data, '{}'::jsonb));

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, _role, NULLIF(_name, ''))
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.sync_role_to_jwt(NEW.id, _role);
  RETURN NEW;
END;
$$;

-- Traer nombres desde Auth (sobrescribe full_name cuando Auth tiene dato)
UPDATE public.profiles p
SET
  full_name = v.dname,
  updated_at = now()
FROM (
  SELECT
    u.id,
    NULLIF(public.display_name_from_auth_meta(u.raw_user_meta_data), '') AS dname
  FROM auth.users u
) v
WHERE p.id = v.id
  AND v.dname IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  IF NEW.raw_user_meta_data IS NOT DISTINCT FROM OLD.raw_user_meta_data THEN
    RETURN NEW;
  END IF;

  _name := NULLIF(public.display_name_from_auth_meta(NEW.raw_user_meta_data), '');

  IF _name IS NOT NULL THEN
    UPDATE public.profiles
    SET
      full_name = _name,
      updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_updated();

COMMENT ON FUNCTION public.display_name_from_auth_meta(jsonb) IS
  'Unifica full_name / name / display_name de user_metadata (Auth).';
