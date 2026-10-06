# Migración y cutover (Supabase → self-host)

## Checklist de validación

1. Conteos: `pedidos`, `pedido_items`, `insumos`, `precios_impresion`, `precios_anillado`, `productos`, `profiles`, `users`
2. Login admin / operador / vendedor
3. Crear pedido → BOM → stock
4. Dashboard / reportes
5. Plantillas WhatsApp
6. Facturación

## Backup

```bash
export SUPABASE_DB_URL='postgres://postgres.[ref]:[pass]@aws-0-....pooler.supabase.com:5432/postgres'
./scripts/backup-supabase.sh
```

## Schema self-host + restore

```bash
export DATABASE_URL='postgres://printmanager:PASS@localhost:5432/printmanager'
./sql/selfhost/apply.sh
DUMP=./backups/printmanager_supabase_XXXX.dump \
USERS_CSV=./backups/auth_users_XXXX.csv \
./scripts/restore-to-selfhost.sh
```

## Cutover en VPS

1. Dump final en ventana corta
2. `docker compose up -d` con db + api + printmanager
3. Restore al volumen Postgres
4. Verificar app en `:3010`
5. Dejar Supabase en solo lectura unos días
6. Borrar proyecto Supabase cuando esté estable

## Bootstrap admin (si no hay usuarios)

```sql
-- password: admin123 (bcrypt generado con Nest/bcrypt cost 10)
-- Mejor: endpoint interno o script node que use AuthService.createUser
INSERT INTO public.users (email, password_hash, full_name, raw_app_meta_data)
VALUES (
  'admin@local',
  crypt('admin123', gen_salt('bf')),
  'Admin',
  '{"role":"admin"}'::jsonb
);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM public.users WHERE email='admin@local');
```

Nota: Supabase usa bcrypt en `encrypted_password`; se puede copiar tal cual a `password_hash` (compatible con `bcrypt.compare` de Nest).
