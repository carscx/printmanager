#!/usr/bin/env bash
# Backup completo desde Supabase (o cualquier Postgres).
# Uso: SUPABASE_DB_URL='postgres://...' ./scripts/backup-supabase.sh
set -euo pipefail
OUT_DIR="${OUT_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Definí SUPABASE_DB_URL (connection string de Settings → Database)" >&2
  exit 1
fi

DUMP="$OUT_DIR/printmanager_supabase_${STAMP}.dump"
USERS="$OUT_DIR/auth_users_${STAMP}.csv"

echo "==> pg_dump → $DUMP"
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-acl -f "$DUMP"

echo "==> export auth.users → $USERS"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT id, email, encrypted_password,
         coalesce(raw_user_meta_data::text,'{}'),
         coalesce(raw_app_meta_data::text,'{}')
  FROM auth.users
) TO STDOUT WITH CSV HEADER" > "$USERS"

echo "OK. Guardá $DUMP y $USERS en lugar seguro."
