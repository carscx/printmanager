#!/bin/sh
# Aplica el esquema PrintManager en una Postgres self-host (sin Supabase Auth/RLS).
# Uso: DATABASE_URL=postgres://... ./sql/selfhost/apply.sh
set -eu

SELFHOST=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SQL_DIR=$(CDPATH= cd -- "$SELFHOST/.." && pwd)

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Definí DATABASE_URL (ej. postgres://printmanager:printmanager@localhost:5432/printmanager)" >&2
  exit 1
fi

run_sql() {
  file="$1"
  echo "==> $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
}

run_sql "$SELFHOST/00_bootstrap.sql"
run_sql "$SELFHOST/02_auth_selfhost.sql"

for f in $(ls -1 "$SQL_DIR"/*.sql | sort); do
  base=$(basename "$f")
  case "$base" in
    02_auth_rls.sql|08_seed_datos_prueba.sql|18_sync_profiles_nombres_auth.sql|30_grants_authenticated_public.sql|32_postgrest_reload_schema.sql|34_plantillas_whatsapp_rls_operador.sql|52_ejemplo_stock_inventario_manual.sql|59_bot_whatsapp_rpc.sql|60_rls_audit_fix.sql)
      echo "-- skip $base"
      continue
      ;;
  esac
  run_sql "$f"
done

run_sql "$SELFHOST/99_disable_rls.sql"
echo "OK: esquema self-host aplicado."
