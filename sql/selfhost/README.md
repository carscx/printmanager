# Instalación self-host (sin Supabase)

## Orden

1. `00_bootstrap.sql` — extensiones, `public.users`, stub `auth.users`, roles dummy
2. `02_auth_selfhost.sql` — `profiles` + triggers (reemplaza `../02_auth_rls.sql`)
3. Scripts de `../` en orden alfanumérico **excepto** los listados abajo
4. `99_disable_rls.sql`

## Scripts omitidos

| Archivo | Motivo |
|---------|--------|
| `02_auth_rls.sql` | Reemplazado por `02_auth_selfhost.sql` |
| `08_seed_datos_prueba.sql` | Opcional (demo) |
| `18_sync_profiles_nombres_auth.sql` | Dependía de `auth.users` Supabase |
| `30_grants_authenticated_public.sql` | Solo PostgREST |
| `32_postgrest_reload_schema.sql` | Solo PostgREST |
| `34_plantillas_whatsapp_rls_operador.sql` | Solo RLS |
| `52_ejemplo_stock_inventario_manual.sql` | Ejemplo manual |
| `59_bot_whatsapp_rpc.sql` | Bot externo |
| `60_rls_audit_fix.sql` | Solo RLS Supabase |

## Aplicar

```bash
export DATABASE_URL=postgres://printmanager:printmanager@localhost:5432/printmanager
chmod +x sql/selfhost/apply.sh
./sql/selfhost/apply.sh
```

En Docker, el contenedor `db` monta estos scripts vía el entrypoint de init (ver `docker-compose.yml`).
