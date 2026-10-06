#!/usr/bin/env bash
# Restaura datos public.* sobre un esquema self-host ya aplicado + importa usuarios.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || -z "${DUMP:-}" ]]; then
  echo "Requiere DATABASE_URL y DUMP" >&2
  exit 1
fi

echo "==> Restore data-only (public) desde $DUMP"
pg_restore --data-only --no-owner --no-acl --schema=public \
  --disable-triggers -d "$DATABASE_URL" "$DUMP" || true

if [[ -n "${USERS_CSV:-}" && -f "$USERS_CSV" ]]; then
  echo "==> Importar usuarios desde $USERS_CSV"
  ABS_USERS=$(cd "$(dirname "$USERS_CSV")" && pwd)/$(basename "$USERS_CSV")
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE TEMP TABLE tmp_auth_users (
  id uuid,
  email text,
  encrypted_password text,
  raw_user_meta_data text,
  raw_app_meta_data text
);
\\copy tmp_auth_users FROM '${ABS_USERS}' WITH CSV HEADER
INSERT INTO public.users (id, email, password_hash, full_name, raw_user_meta_data, raw_app_meta_data)
SELECT
  id,
  lower(email),
  encrypted_password,
  nullif(trim(coalesce(raw_user_meta_data::jsonb ->> 'full_name', raw_user_meta_data::jsonb ->> 'name', '')), ''),
  coalesce(raw_user_meta_data::jsonb, '{}'::jsonb),
  coalesce(raw_app_meta_data::jsonb, '{}'::jsonb)
FROM tmp_auth_users
WHERE email IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data;

UPDATE public.profiles p
SET full_name = COALESCE(NULLIF(trim(u.full_name), ''), p.full_name)
FROM public.users u
WHERE p.id = u.id;
SQL
fi

echo "==> Conteos rápidos"
psql "$DATABASE_URL" -c "SELECT 'pedidos' t, count(*) FROM pedidos UNION ALL SELECT 'insumos', count(*) FROM insumos UNION ALL SELECT 'users', count(*) FROM users UNION ALL SELECT 'profiles', count(*) FROM profiles;"

echo "OK restore. Probá login con un usuario migrado."
