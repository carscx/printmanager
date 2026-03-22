# Base de datos Printmanager — SQL canónico

Scripts en esta carpeta (`sql/` en la raíz del repo). En Supabase: **SQL Editor**, mismo proyecto (DEV o PROD).

---

## Orden de ejecución (una sola lista)

Los nombres de archivo ordenan **alfanuméricamente** así: `01` … `05`, luego **`06`–`08`** (WhatsApp + seed), luego **`09`–`23`**, **`25`–`32`**.  
**No hay `24` en la raíz**: el antiguo migrador de tinta ml → carillas está en **`archive/`** y solo aplica a bases legacy.

### Instalación desde cero (esquema + lógica; sin datos demo)

Ejecutá **en este orden**:

| # | Archivo |
|---|---------|
| 1 | `01_schema_core.sql` |
| 2 | `02_auth_rls.sql` |
| 3 | `03_insumos.sql` |
| 4 | `04_equipos.sql` |
| 5 | `05_precios_motor.sql` |
| 6 | `06_plantillas_whatsapp.sql` |
| 7 | `07_whatsapp_log.sql` |
| 8 | `09_epic1_costos_rentabilidad.sql` |
| 9 | `10_epic1_stock_presupuesto.sql` |
| 10 | `11_epic2_recetas_bom.sql` |
| 11 | `12_epic2_costo_rentabilidad.sql` |
| 12 | `13_epic3_presupuestos_whatsapp.sql` |
| 13 | `14_epic4_dashboard_estadisticas.sql` |
| 14 | `15_epic4_comisiones_vendedores.sql` |
| 15 | `16_v_rendimiento_vendedores.sql` |
| 16 | `17_epic4_comision_solo_vendedores.sql` |
| 17 | `18_sync_profiles_nombres_auth.sql` |
| 18 | `19_epic5_insumos_crud_recetas.sql` |
| 19 | `20_reglas_negocio_spring_clean.sql` |
| 20 | `21_epic5_rendimiento_reglas_explotar.sql` |
| 21 | `22_reglas_anillado_precios.sql` |
| 22 | `23_epic5_reglas_negocio_fin.sql` |
| 23 | `25_insumos_costo_refresh_recetas.sql` |
| 24 | `26_insumos_sin_autos_costo_stock.sql` |
| 25 | `27_epic5_borrar_insumos_impresion_maestros_tinta_ml.sql` |
| 26 | `28_pedidos_maquina_estados_unificada.sql` |
| 27 | `29_plantillas_whatsapp_estados.sql` |
| 28 | `30_grants_authenticated_public.sql` |
| 29 | `31_precios_impresion_tarifas_abm.sql` |
| 30 | `32_postgrest_reload_schema.sql` |

**Opcional (solo desarrollo / demo):** al final, `08_seed_datos_prueba.sql` (config, equipos, insumos demo, precios, plantillas, 3 pedidos). En **producción** suele omitirse o adaptarse para no pisar datos reales.

---

## Ya ejecuté el `08` — ¿qué sigue?

Si el `08` ya corrió pero **faltan** migraciones posteriores al esquema que tenías:

1. **`28_pedidos_maquina_estados_unificada.sql`** — estados unificados (presupuesto → pendiente → listo → …), stock al pasar a pendiente, RPC y vistas.
2. **`29_plantillas_whatsapp_estados.sql`** — alinea `plantillas_whatsapp.estado_destino` (p. ej. `señado` → `pendiente`, plantilla `listo`). Idempotente.
3. **`30_grants_authenticated_public.sql`** — si la API devuelve `permission denied for table` con usuario logueado.
4. **`31_precios_impresion_tarifas_abm.sql`** — varias tarifas de impresión por combinación tipo/cara (solo una activa); columna `nombre`. Necesaria para el ABM de tarifas en la app. Incluye `NOTIFY pgrst` al final.
5. **`32_postgrest_reload_schema.sql`** — solo si la API sigue con **PGRST204** (`nombre` / schema cache): fuerza recarga de PostgREST. También podés ejecutar solo: `NOTIFY pgrst, 'reload schema';`

Orden: **siempre 28 antes que 29**.  
Si recreás todo desde cero, el `08` moderno ya trae plantillas alineadas; el `29` igual puede ejecutarse (no duplica si ya está actualizado).

---

## Antes del primer script

1. Proyecto Supabase listo.
2. **Authentication → Users**: al menos un usuario; en metadata podés usar `{ "role": "admin", "full_name": "Admin" }`.
3. Frontend con **URL y anon key** del proyecto.

### Después del paso 2 (`02_auth_rls.sql`)

- Para dar **admin** a un usuario:
  ```sql
  UPDATE profiles SET role = 'admin' WHERE id = '<uuid>';
  ```
- Cerrá sesión y volvé a entrar para refrescar el JWT.

---

## Re-ejecutar solo datos de prueba

- El **`08`** puede borrar pedidos demo y **todas** las filas de `plantillas_whatsapp` y volver a insertar defaults. Si personalizaste plantillas, comentá el `DELETE` / `INSERT` de plantillas en ese archivo.
- Para reset amplio, descomentá el bloque `TRUNCATE ... CASCADE` al inicio del `08` (solo entornos de prueba).

---

## Scripts archivados (no usar en instalación nueva)

Ver **`archive/README.md`**. Incluye el migrador legacy de stock de tinta en ml (`24_…`), solo para bases antiguas con datos en ese formato.

---

## Qué deberías ver en la app (con `08`)

- **Pedidos**: 3 pedidos demo (entregado, taller, pendiente con seña).
- **Plantillas WhatsApp**: 7 plantillas (incluye `listo` para avisar retiro).
- **Reportes** (admin): rentabilidad / consumos donde aplique.

---

## Notas para producción

- Si la API devuelve **403** / `permission denied for table …` (**42501**) con usuario logueado, suele faltar **GRANT** al rol `authenticated` (RLS no alcanza). Ejecutá **`30_grants_authenticated_public.sql`** en el mismo proyecto Supabase.
- Preferí un **proyecto Supabase limpio** y ejecutar la tabla de instalación de arriba **una vez**, sin el `08` o con un seed mínimo propio.
- Para **Supabase CLI / migraciones versionadas**, podés copiar estos archivos como migraciones en el mismo orden (sin `archive/`).
- Vistas SQL antiguas que filtren por estado `señado` pueden quedar desalineadas con el modelo unificado (`28`); revisá reportes si venís de un esquema muy viejo.
