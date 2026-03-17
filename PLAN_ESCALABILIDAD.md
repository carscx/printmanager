# PrintManager — Plan de Escalabilidad

> Documento de referencia para la profesionalización y escalabilidad de la aplicación.
> Fecha de creación: 15 de marzo de 2026

---

## 1. Estado Actual

### Stack

| Capa     | Tecnología                                                      |
| -------- | --------------------------------------------------------------- |
| Frontend | Vanilla JS (ES Modules), HTML5                                  |
| Estilos  | Tailwind CSS 3 (JIT vía CDN)                                    |
| Iconos   | Font Awesome 6 (CDN)                                            |
| Backend  | Supabase (PostgreSQL + REST API)                                |
| Build    | Ninguno (archivos estáticos)                                    |
| Tests    | Ninguno                                                         |
| Auth     | Password hardcodeada (`monica2026`) con timer en sessionStorage |
| Deploy   | Archivos estáticos (sin CI/CD visible)                          |

### Arquitectura actual

```
index.html (SPA monolítica)
├── js/main.js      → Estado global + lógica de negocio + navegación
├── js/api.js       → Capa de acceso a Supabase (CRUD pedidos, config)
├── js/ui.js        → Renderizado DOM + event handlers (acoplados)
├── js/supabase.js  → Inicialización Supabase + secretos hardcodeados
└── js/services/calculator.js → Cálculos de precios y resumen diario
```

### Tablas en Supabase

- `config` — Key-value de configuración (precios, markup, comisiones)
- `pedidos` — Cabecera de pedidos (cliente, estado, pagos, fechas)
- `pedido_items` — Ítems de pedido (archivo, páginas, tipo, anillado, subtotal)

### Problemas identificados

1. **Secretos en código fuente** — API keys y password de admin hardcodeados
2. **Sin autenticación real** — Acceso anónimo con RLS permisivo
3. **Estado frágil** — Carrito y edición se pierden al refrescar
4. **Acoplamiento fuerte** — UI, lógica y datos mezclados
5. **Sin build pipeline** — Sin minificación, tree-shaking, ni variables de entorno
6. **Sin tests** — Cero cobertura
7. **Sin offline real** — Manifest PWA presente pero sin Service Worker
8. **Precios rígidos** — Sin soporte para descuentos, copias, redondeo configurable

---

## 2. Stack Propuesto

### Decisión: React + TypeScript + Vite + TailwindCSS

| Componente    | Elección                 | Justificación                                                                     |
| ------------- | ------------------------ | --------------------------------------------------------------------------------- |
| **Framework** | React 19                 | Ecosistema maduro, enorme comunidad, excelente tooling, componentes reutilizables |
| **Lenguaje**  | TypeScript               | Tipado estricto = menos bugs, mejor autocompletado, refactors seguros             |
| **Build**     | Vite                     | Build ultrarrápido, HMR instantáneo, soporte nativo TS/React                      |
| **Estilos**   | TailwindCSS 4            | Ya se usa; build-time compilation elimina CSS muerto                              |
| **State**     | Zustand o React Context  | Ligero, sin boilerplate excesivo                                                  |
| **Routing**   | React Router v7          | SPA con rutas declarativas                                                        |
| **Backend**   | Supabase (mismo)         | Se mantiene; se incorpora Auth + RLS real                                         |
| **Forms**     | React Hook Form + Zod    | Validación tipada de formularios                                                  |
| **Testing**   | Vitest + Testing Library | Integrado con Vite, rápido                                                        |
| **Deploy**    | Vercel o Netlify         | Deploy automático desde Git, preview por PR                                       |

### ¿Por qué no otras opciones?

| Alternativa         | Descartada porque                                                    |
| ------------------- | -------------------------------------------------------------------- |
| Next.js             | Overkill — no necesitamos SSR ni API routes (Supabase es el backend) |
| Vue/Svelte          | Buenos frameworks, pero React tiene mayor ecosistema y empleabilidad |
| Angular             | Demasiado pesado y ceremonioso para esta escala                      |
| Mantener Vanilla JS | No escala — ya se nota el acoplamiento y la fragilidad del estado    |

---

## 3. Arquitectura Objetivo

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Router + layout principal
├── config/
│   └── supabase.ts             # Cliente Supabase (env vars)
├── types/
│   ├── pedido.ts               # Tipos de pedidos e items
│   ├── config.ts               # Tipos de configuración/precios
│   └── auth.ts                 # Tipos de usuario/sesión
├── hooks/
│   ├── useAuth.ts              # Hook de autenticación
│   ├── usePedidos.ts           # Hook de CRUD pedidos
│   ├── useConfig.ts            # Hook de configuración/precios
│   └── useResumen.ts           # Hook de resumen financiero
├── services/
│   ├── api.ts                  # Capa de acceso a Supabase
│   ├── calculator.ts           # Lógica de precios (tipada)
│   └── auth.ts                 # Servicio de autenticación
├── store/
│   └── useCartStore.ts         # Estado del carrito (Zustand)
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pedidos/
│   │   ├── PedidoCard.tsx
│   │   ├── PedidoList.tsx
│   │   ├── PedidoForm.tsx
│   │   └── ItemRow.tsx
│   ├── cart/
│   │   ├── Cart.tsx
│   │   └── CartItem.tsx
│   ├── reportes/
│   │   ├── ResumenDiario.tsx
│   │   ├── HistorialPedidos.tsx
│   │   └── ReporteGanancias.tsx
│   ├── config/
│   │   ├── PreciosForm.tsx
│   │   └── ConfigPanel.tsx
│   └── ui/
│       ├── Badge.tsx
│       ├── Toast.tsx
│       ├── ConfirmModal.tsx
│       └── Button.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── NuevoPedidoPage.tsx
│   ├── HistorialPage.tsx
│   ├── ReportesPage.tsx
│   └── ConfigPage.tsx
└── utils/
    ├── formatters.ts           # Formateo de moneda, fechas
    └── constants.ts            # Constantes de la app
```

---

## 4. Roadmap por Fases

Cada fase es un entregable funcional. No se avanza a la siguiente sin completar la anterior.

---

### FASE 0 — Scaffolding y migración base ✅ COMPLETADA

> **Objetivo:** Proyecto React+TS+Vite funcionando con la UI actual replicada.
> **Completada:** 15 de marzo de 2026

- [x] Crear proyecto con `npm create vite@latest` (React + TS)
- [x] Configurar TailwindCSS 4 (via PostCSS - Vite 8 no soporta @tailwindcss/vite aún)
- [x] Configurar variables de entorno (`.env.local` / `.env.example`)
- [x] Mover credenciales Supabase a `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- [x] Crear cliente Supabase tipado (`config/supabase.ts`)
- [x] Definir tipos TypeScript para `Pedido`, `PedidoItem`, `Config`
- [x] Crear capa de servicios (`services/api.ts`) migrando `api.js`
- [x] Migrar `calculator.js` → `services/calculator.ts` con tipos
- [x] Crear componentes UI base (Badge, Toast, ConfirmModal)
- [x] Crear layout principal (Header + React Router)
- [x] Replicar vista de pedidos (taller/historial) como componentes
- [x] Replicar formulario de nuevo pedido + carrito (con Zustand persistente)
- [x] Replicar panel de configuración admin
 - [x] Build exitoso (tsc + vite build)
 - [ ] Configurar deploy (CI/CD) desde repositorio Git hacia VPS propio

**Stack final instalado:** React 19, TypeScript 5.9, Vite 8, TailwindCSS 4, Supabase JS, React Router, Zustand

**Proyecto en:** `printmanager-react/`

---

### FASE 1 — Autenticación con Supabase Auth ✅ COMPLETADA

> **Objetivo:** Login real, sesiones persistentes, RLS por usuario.

- [x] Habilitar Supabase Auth (email/password)
- [x] Crear página de Login (`LoginPage.tsx`)
- [x] Implementar `useAuth` hook (login, logout, sesión)
- [x] Crear `ProtectedRoute` para rutas privadas
- [x] Migrar la lógica de "admin" a roles de Supabase (metadata `user_metadata.role`)
- [x] Configurar RLS real en `pedidos`, `pedido_items`, `config` (SQL en `supabase_auth_rls.sql`)
  - Solo usuarios autenticados pueden leer/escribir
  - Admin puede modificar config; usuario normal no
  - Solo admin puede borrar pedidos/items
- [x] Eliminar password hardcodeada y lógica de sessionStorage (no existían en React)
- [x] Crear usuario(s) iniciales (ejecutar SQL y crear desde Dashboard Supabase)

**Criterio de éxito:** Solo usuarios autenticados acceden a la app. Admin tiene permisos elevados.

**Estado: ✅ COMPLETADA**

---

### FASE 2 — Número de copias y mejora del modelo de ítems ✅ COMPLETADA

> **Objetivo:** Soporte para múltiples copias de un mismo trabajo.

- [x] Agregar columna `copias` (default 1) a `pedido_items`
- [x] Actualizar tipos TypeScript (`PedidoItem.copias`)
- [x] Agregar input de copias en el formulario de nuevo ítem
- [x] Actualizar `calculator.ts`:
  - `subtotal_item = (precio_unitario_por_hoja × hojas + anillado) × copias`
- [x] Actualizar renderizado en carrito (ItemRow) y tarjeta de pedido (PedidoCard)
- [x] Migrar datos existentes (columna con `DEFAULT 1`, no requiere UPDATE)
- [x] Persistir `copias` en DB (`api.ts mapItemToDB`)

**Criterio de éxito:** Se pueden crear pedidos con N copias, el precio refleja la cantidad.

**Estado: ✅ COMPLETADA** — SQL ejecutado en Supabase.

---

### FASE 3A — Catálogo de insumos y control de stock

> **Objetivo:** Cargar, administrar y controlar el inventario de todos los insumos del negocio.

#### Modelo de datos: `insumos`

```sql
CREATE TABLE insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL CHECK (categoria IN (
    'espiral', 'tapa_transparente', 'tapa_color',
    'papel', 'tinta', 'toner',
    'bolsa', 'bolsa_propileno', 'clip', 'otro'
  )),
  nombre TEXT NOT NULL,           -- "Espiral 12mm Negro", "Resma A4 75g", etc.
  unidad TEXT NOT NULL CHECK (unidad IN (
    'unidad', 'litro', 'resma', 'cartucho', 'paquete'
  )),
  -- Atributos opcionales por categoría
  medida_mm INTEGER,              -- Solo espirales: 7,9,12,14,17,20,23,33
  color TEXT,                     -- Espirales de color, tapas de color
  tipo_papel TEXT,                -- Solo papel: "A4 75g", "A4 80g", "Oficio 75g"
  rendimiento INTEGER,            -- Tinta/toner: páginas por litro/cartucho
  hojas_por_unidad INTEGER,       -- Papel: 500 hojas por resma
  -- Costos y stock
  precio_compra NUMERIC NOT NULL DEFAULT 0,
  stock_actual NUMERIC NOT NULL DEFAULT 0,
  stock_minimo NUMERIC NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
```

**Registros iniciales previstos:**

| Categoría         | Nombre                 | Medida | Color    | Precio compra | Unidad   |
| ----------------- | ---------------------- | ------ | -------- | ------------- | -------- |
| espiral           | Espiral 7mm            | 7      | -        | $?            | unidad   |
| espiral           | Espiral 9mm            | 9      | -        | $?            | unidad   |
| espiral           | Espiral 12mm           | 12     | -        | $?            | unidad   |
| espiral           | Espiral 12mm Azul      | 12     | Azul     | $?            | unidad   |
| espiral           | Espiral 12mm Rojo      | 12     | Rojo     | $?            | unidad   |
| espiral           | Espiral 12mm Verde     | 12     | Verde    | $?            | unidad   |
| espiral           | Espiral 12mm Amarillo  | 12     | Amarillo | $?            | unidad   |
| espiral           | Espiral 12mm Blanco    | 12     | Blanco   | $?            | unidad   |
| espiral           | Espiral 14mm           | 14     | -        | $?            | unidad   |
| espiral           | Espiral 17mm           | 17     | -        | $?            | unidad   |
| espiral           | Espiral 20mm           | 20     | -        | $?            | unidad   |
| espiral           | Espiral 23mm           | 23     | -        | $?            | unidad   |
| espiral           | Espiral 33mm           | 33     | -        | $?            | unidad   |
| tapa_transparente | Tapa transparente A4   | -      | -        | $?            | unidad   |
| tapa_color        | Tapa color A4 Negra    | -      | Negro    | $?            | unidad   |
| tapa_color        | Tapa color A4 Azul     | -      | Azul     | $?            | unidad   |
| tapa_color        | Tapa color A4 Roja     | -      | Rojo     | $?            | unidad   |
| tapa_color        | Tapa color A4 Verde    | -      | Verde    | $?            | unidad   |
| tapa_color        | Tapa color A4 Amarilla | -      | Amarillo | $?            | unidad   |
| papel             | Resma A4 75g           | -      | -        | $?            | resma    |
| tinta             | Tinta negra Epson      | -      | Negro    | $?            | litro    |
| tinta             | Tinta cian Epson       | -      | Cian     | $?            | litro    |
| tinta             | Tinta magenta Epson    | -      | Magenta  | $?            | litro    |
| tinta             | Tinta amarilla Epson   | -      | Amarillo | $?            | litro    |
| toner             | Tóner Pantum P2509w    | -      | Negro    | $?            | cartucho |
| bolsa             | Bolsa para anillado    | -      | -        | $?            | unidad   |
| bolsa_propileno   | Bolsa de propileno     | -      | -        | $?            | unidad   |
| clip              | Clip para hojas        | -      | -        | $?            | unidad   |

#### Modelo de datos: `stock_movimientos`

```sql
CREATE TABLE stock_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad NUMERIC NOT NULL,       -- positivo=entrada, negativo=salida
  motivo TEXT NOT NULL CHECK (motivo IN (
    'compra', 'pedido', 'ajuste_manual', 'devolucion', 'cancelacion'
  )),
  referencia_pedido_id UUID REFERENCES pedidos(id),
  notas TEXT,                      -- "Compra provXXX", etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
```

#### Modelo de datos: `insumos_precios_log`

```sql
CREATE TABLE insumos_precios_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumos(id),
  precio_anterior NUMERIC NOT NULL,
  precio_nuevo NUMERIC NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id)
);
```

#### Tareas de implementación

- [x] Crear migración SQL con las 3 tablas + RLS
- [x] Tipos TypeScript: `Insumo`, `StockMovimiento`, `InsumoPrecioLog`
- [x] Servicio `insumosApi.ts`: CRUD insumos, registrar movimiento, consultar stock
- [x] Hook `useInsumos()`: lista, filtrado por categoría, búsqueda
- [x] Página `InsumosPage.tsx`:
  - Vista de catálogo en cards con filtros por categoría
  - Formulario alta/edición de insumo
  - Indicador visual de stock bajo (rojo si < stock_minimo)
  - Botón "Registrar compra" (carga stock + registra movimiento)
  - Botón "Ajustar stock" (corrección manual con motivo)
  - Historial de movimientos por insumo
- [x] Sección "Historial de precios" por insumo (log automático al cambiar precio_compra vía trigger SQL)
- [x] Alertas de stock bajo en Dashboard (badge/banner)

**Criterio de éxito:** Se puede dar de alta cualquier insumo, cargar compras, ver stock en tiempo real y recibir alertas de stock bajo.

---

### FASE 3B — Equipos (impresoras) y amortización ✅ COMPLETADA

> **Objetivo:** Registrar los equipos del negocio y calcular un costo de amortización/mantenimiento por página impresa.

#### Modelo de datos: `equipos`

```sql
CREATE TABLE equipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,              -- "Epson L3250", "Epson L5590", "Pantum P2509w"
  tipo TEXT NOT NULL CHECK (tipo IN ('inkjet', 'laser')),
  costo_adquisicion NUMERIC NOT NULL DEFAULT 0,   -- $722.000, $180.000, $0 (ya amortizada)
  fecha_adquisicion DATE,
  vida_util_meses INTEGER NOT NULL DEFAULT 36,     -- Meses estimados de vida útil
  costo_mantenimiento_mensual NUMERIC DEFAULT 0,   -- Gastos fijos mensuales de mantenimiento
  paginas_mes_estimadas INTEGER DEFAULT 3000,      -- Producción estimada por mes
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Cálculo de costo de amortización por página:**

```
costo_amort_por_pagina = (costo_adquisicion / vida_util_meses + costo_mantenimiento_mensual) / paginas_mes_estimadas
```

Ejemplo Pantum P2509w: `(180.000 / 36 + 2.000) / 3.000 = $2,33/pág`
Ejemplo Epson L5590: `(722.000 / 36 + 3.000) / 3.000 = $7,68/pág`

> **Nota:** Este costo NO se muestra al cliente. Es un valor interno que se incluye en el cálculo de costo real por trabajo, y se ve reflejado en los reportes de ganancia.

#### Tareas de implementación

- [x] Crear migración SQL `equipos` + RLS
- [x] Tipo TypeScript `Equipo` + función `calcularCostoPorPagina()`
- [x] Servicio `equiposApi.ts` (CRUD)
- [x] Hook `useEquipos()` (lista + toggle inactivos)
- [x] UI: `EquipoForm.tsx` (BottomSheet) + `EquiposList.tsx` (cards mobile-first)
- [x] Página `EquiposPage.tsx` con navegación integrada (ruta + BottomNav + Header)
- [x] Campo derivado: `costo_por_pagina` (calculado, no almacenado)
- [x] Este costo se integra en Fase 3C al motor de costos

**Criterio de éxito:** Se registran las 3 impresoras con sus datos de compra y el sistema calcula automáticamente un costo de amortización por página.

**Estado: ✅ COMPLETADA** — Incluye SQL (`supabase_fase3b_equipos.sql`) ejecutado en Supabase.

---

### FASE 3C — Precios de venta y motor de costos

> **Objetivo:** Reemplazar el sistema rígido de `config` (key-value) por tablas estructuradas de precios de venta, y crear un motor de costos que use insumos + equipos para calcular el costo real de cada trabajo.

#### Modelo de datos: `precios_impresion`

```sql
CREATE TABLE precios_impresion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('bn', 'color')),
  doble_faz BOOLEAN NOT NULL DEFAULT false,
  precio_venta NUMERIC NOT NULL,     -- Lo que cobra al cliente por hoja
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(tipo, doble_faz)
);
```

#### Modelo de datos: `precios_anillado`

Reemplaza `esp_s`, `esp_m`, `esp_l` por precios específicos por medida en mm:

```sql
CREATE TABLE precios_anillado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medida_mm INTEGER NOT NULL,        -- 7,9,12,14,17,20,23,33
  paginas_max INTEGER,               -- Referencia: hasta cuántas hojas soporta
  precio_venta NUMERIC NOT NULL,     -- Precio al cliente (incluye espiral + tapa transp + tapa color + mano de obra)
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(medida_mm)
);
```

> **Nota:** El precio de anillado al cliente es un valor que el usuario fija libremente. Incluye el servicio completo (espiral + tapa transparente + tapa color + trabajo manual). El sistema calcula el costo desglosado por separado para saber la ganancia real.

#### Modelo de datos: `config_costos`

Configuración del motor de costos (valores que alimentan el cálculo automático):

```sql
CREATE TABLE config_costos (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Valores iniciales:
-- 'costo_tinta_por_pagina_bn'     → calculado: precio_litro_negro / rendimiento_paginas
-- 'costo_tinta_por_pagina_color'  → calculado: (sum 4 tintas * factor CMYK) / rendimiento
-- 'costo_toner_por_pagina'        → calculado: precio_cartucho / rendimiento
-- 'costo_papel_por_hoja'          → calculado: precio_resma / 500
-- 'amortizacion_por_pagina'       → promedio ponderado de equipos activos
-- 'markup_general'                → 1.6 (divisor ganancia, migrado desde config.markup)
-- 'comision_sobrina'              → 10 (porcentaje, migrado desde config)
-- 'pago_alias'                    → (migrado desde config, pero TEXT → se queda en config vieja o nueva tabla)
```

#### Motor de costos: cómo se calcula el costo real de un item

```
COSTO DE UN ITEM DE IMPRESIÓN (ej: 45 pág B&N simple faz con anillado 14mm, tapa negra, 2 copias):

Por copia:
  hojas = doble_faz ? ceil(paginas/2) : paginas = 45
  costo_papel      = hojas × (precio_resma / hojas_por_resma) = 45 × $10.00 = $450
  costo_impresion  = hojas × (costo_tinta_o_toner_por_pag)    = 45 × $3.50  = $157.50
  costo_amort      = hojas × (amortizacion_por_pagina)         = 45 × $5.00  = $225
  costo_espiral    = 1 × precio_compra(espiral_14mm)           = $250
  costo_tapa_transp= 1 × precio_compra(tapa_transparente)     = $80
  costo_tapa_color = 1 × precio_compra(tapa_negra)            = $100
  costo_bolsa      = 1 × precio_compra(bolsa_anillado)        = $30
  ─────────────────────────────────────────────────────────────
  COSTO POR COPIA = $1.292,50

Total: costo_por_copia × copias = $1.292,50 × 2 = $2.585

Precio venta:
  impresion  = hojas × precio_venta(bn_sf)  = 45 × $35 = $1.575
  anillado   = precio_venta(14mm)            =           $1.200
  por_copia  = $2.775
  total      = $2.775 × 2 = $5.550

GANANCIA = $5.550 − $2.585 = $2.965 (53,4%)
```

#### Tabla `pedido_items_insumos` (consumo congelado)

Cuando un pedido pasa a estado `señado` o `pagado`, se congela el detalle de insumos consumidos:

```sql
CREATE TABLE pedido_items_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id UUID NOT NULL REFERENCES pedido_items(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id),
  equipo_id UUID REFERENCES equipos(id),  -- Para amortización
  cantidad NUMERIC NOT NULL,
  costo_unitario_congelado NUMERIC NOT NULL,  -- Costo al momento del pedido
  costo_total NUMERIC NOT NULL,               -- cantidad × costo_unitario
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Migración de datos (config vieja → tablas nuevas)

```
config.t_bn_s  → precios_impresion (bn, false, $35)
config.t_bn_d  → precios_impresion (bn, true, $55)
config.t_col_s → precios_impresion (color, false, $70)
config.t_col_d → precios_impresion (color, true, $110)
config.esp_s   → precios_anillado (7mm?, $700) — REQUIERE mapeo de medidas
config.esp_m   → precios_anillado (14mm?, $1000)
config.esp_l   → precios_anillado (23mm?, $1400)
config.markup  → config_costos (markup_general, 1.6)
config.comision_sobrina → config_costos (comision_sobrina, 10)
```

> **Nota:** Los valores esp_s/m/l se mapean a medidas específicas. Los espirales que no existían (9, 12, 17, 20, 33) necesitan precio nuevo.

#### Tareas de implementación

- [x] Crear migraciones SQL: `precios_impresion`, `precios_anillado`, `config_costos`, `pedido_items_insumos`
- [x] Migrar datos de `config` vieja a tablas nuevas
- [x] Tipos TypeScript: `PrecioImpresion`, `PrecioAnillado`, `ConfigCosto`, `PedidoItemInsumo`
- [x] Servicio `preciosApi.ts`: CRUD precios, consultar costos
- [x] Motor de costos `costEngine.ts`:
  - `calcularCostoItem(params, insumos, equipos)` → desglose de costo
  - `calcularPrecioVenta(params, precios)` → precio al cliente
  - `calcularGanancia(precioVenta, costoTotal)` → ganancia absoluta y %
- [x] Refactorizar `calculator.ts` para usar las nuevas tablas en vez de `AppConfig`
- [x] Página `PreciosPage.tsx`:
  - Grilla de precios de impresión (edición inline)
  - Grilla de precios de anillado por mm (edición inline)
  - Vista de costos reales al lado de precios (para que el admin vea márgenes)
  - Ajuste masivo por porcentaje (+10%, -5%)
- [x] Actualizar formulario de nuevo pedido:
  - Selector de anillado cambia a lista de medidas en mm (no esp_s/m/l)
  - Selector de color de tapa dorso (si hay anillado)
  - Opción de bolsa para anillado
  - Opción de clips (para hojas sueltas, si no lleva anillado)
  - Preview: precio venta + costo + ganancia estimada (solo visible para admin)
- [x] Hook `usePreciosVenta()` y `useConfigCostos()`

**Criterio de éxito:** Los precios se cargan desde tablas estructuradas, el sistema calcula costo real vs precio de venta, y el formulario usa medidas reales de espiral.

**Estado: ✅ COMPLETADA**

---

### FASE 4 — Estados de pedido y stock automático

> **Objetivo:** Ciclo de vida del pedido con transiciones claras, y descuento/restauración automática de stock.

#### Máquina de estados del pedido

```
                    ┌──────────┐
                    │PRESUP.   │ ← Cotización sin compromiso
                    └────┬─────┘
                         │ confirmar
                    ┌────▼─────┐
                    │PENDIENTE │ ← Pedido confirmado, sin pago
                    └────┬─────┘
                    ┌────▼─────┐
              ┌─────│ SEÑADO   │ ← Seña parcial pagada ✓ DESCUENTA STOCK
              │     └────┬─────┘
              │     ┌────▼─────┐
              │     │ PAGADO   │ ← Pago total ✓ DESCUENTA STOCK (si no señado antes)
              │     └────┬─────┘
              │     ┌────▼─────┐
              └────►│ENTREGADO │ ← Entregado al cliente
                    └──────────┘
                    ┌──────────┐
                    │CANCELADO │ ← Restaura stock si había descontado
                    └──────────┘
```

| Transición                          | Acción sobre stock                                                   |
| ----------------------------------- | -------------------------------------------------------------------- |
| → `presupuesto`                     | Nada                                                                 |
| → `pendiente`                       | Nada                                                                 |
| → `señado`                          | **Descuenta stock** + crea `pedido_items_insumos` + crea movimientos |
| → `pagado` (desde pendiente)        | **Descuenta stock** + crea `pedido_items_insumos` + crea movimientos |
| → `pagado` (desde señado)           | Nada (ya descontado)                                                 |
| → `entregado`                       | Nada (ya descontado)                                                 |
| → `cancelado` (desde señado/pagado) | **Restaura stock** + crea movimientos de devolución                  |

#### Modificaciones a `pedidos`

```sql
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_pago TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT false;
-- El campo 'estado' pasa a usar los nuevos valores:
-- 'presupuesto' | 'pendiente' | 'señado' | 'pagado' | 'entregado' | 'cancelado'
```

#### Tareas de implementación

- [x] Migrar estados existentes ('Pendiente' → 'pendiente', 'Listo' → 'entregado')
- [x] Servicio `stockEngine.ts`:
  - `descontarStock(pedidoId)`: lee items, calcula insumos necesarios, decrementa stock, registra movimientos
  - `restaurarStock(pedidoId)`: revierte los movimientos del pedido
- [x] Actualizar `api.ts` con las transiciones de estado
- [x] Actualizar UI: badges de estado con colores diferenciados
- [x] Botones de acción por estado:
  - Presupuesto: Confirmar | Editar | Cancelar
  - Pendiente: Señar | Cobrar total | Editar | Cancelar
  - Señado: Cobrar resto | Entregar | Cancelar
  - Pagado: Entregar | Cancelar
- [x] Notificación/alerta si al señar/pagar un pedido algún insumo queda en stock 0 o negativo
- [x] Confirmación de cancelación con aviso "Se restaurará el stock de X insumos"

**Estado: ✅ COMPLETADA**

#### Sistema de mensajes WhatsApp por estado (pendiente)

Cada transición de estado dispara un botón para enviar un mensaje de WhatsApp personalizable. Los mensajes se componen desde **plantillas editables** almacenadas en la DB.

##### Modelo de datos: `plantillas_whatsapp`

```sql
CREATE TABLE plantillas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado_destino TEXT NOT NULL,   -- 'presupuesto','pendiente','señado','pagado','entregado','cancelado'
  nombre TEXT NOT NULL,           -- "Presupuesto", "Confirmación de seña", etc.
  cuerpo TEXT NOT NULL,           -- Plantilla con variables: {{cliente}}, {{detalle}}, {{total}}, etc.
  incluir_datos_pago BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
```

##### Variables disponibles en plantillas

| Variable            | Valor                                    |
| ------------------- | ---------------------------------------- |
| `{{cliente}}`       | Nombre del cliente                       |
| `{{detalle}}`       | Lista de items (páginas, tipo, anillado) |
| `{{total}}`         | Total del pedido formateado              |
| `{{sena}}`          | Monto de la seña                         |
| `{{resta}}`         | Monto restante (total - seña)            |
| `{{estado}}`        | Estado actual del pedido                 |
| `{{fecha_entrega}}` | Fecha de entrega                         |
| `{{alias_pago}}`    | Alias para transferencia                 |
| `{{cbu}}`           | CBU                                      |
| `{{titular_pago}}`  | Nombre del titular de la cuenta          |
| `{{observaciones}}` | Observaciones del pedido                 |

##### Plantillas por defecto (editables desde admin)

| Estado destino      | Incluye pago       | Plantilla                                                                                                           |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `presupuesto`       | Sí (si total > 0)  | "Hola {{cliente}}, te paso el presupuesto:\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPagos:\nAlias: _{{alias_pago}}_" |
| `señado`            | Sí                 | "Hola {{cliente}}, recibimos tu seña de _{{sena}}_.\nResta: _{{resta}}_\n\nTe avisamos cuando esté listo!"          |
| `pagado`            | No                 | "Hola {{cliente}}, tu pago de _{{total}}_ fue registrado. Te avisamos cuando esté listo!"                           |
| `entregado` / listo | No                 | "Hola {{cliente}}, tu pedido está listo para retirar 🎉\n\n{{detalle}}"                                             |
| `cancelado`         | Sí (si había seña) | "Hola {{cliente}}, tu pedido fue cancelado. Si tenías seña, coordinamos la devolución."                             |

##### Datos de pago (administrables)

```sql
-- Se agregan a config_costos o a una tabla dedicada:
-- 'pago_alias'       → Alias de mercadopago/transferencia
-- 'pago_cbu'         → CBU completo
-- 'pago_titular'     → Nombre del titular
-- 'pago_banco'       → Nombre del banco
```

##### Flujo de envío

1. El operador presiona el botón WA en un pedido
2. Se abre una pantalla de **previsualización del mensaje** (no un modal — usa pantalla completa en mobile)
3. El mensaje viene prellenado con la plantilla del estado actual + datos del pedido
4. El operador puede **editar el texto libre** antes de enviar
5. Al confirmar, se abre WhatsApp con el mensaje
6. Opcionalmente se guarda un log del mensaje enviado

##### Tareas de implementación adicionales (WhatsApp) — PENDIENTE

- [ ] Crear tabla `plantillas_whatsapp` + seed con plantillas por defecto
- [ ] Crear tabla/campos para datos de pago editables (alias, CBU, titular, banco)
- [ ] Tipo TypeScript `PlantillaWhatsapp`
- [ ] Servicio `whatsappService.ts`: renderizar plantilla con variables del pedido
- [ ] Pantalla de previsualización de mensaje (full-screen en mobile, drawer en desktop)
- [ ] Página admin de gestión de plantillas (editar cuerpo, activar/desactivar, reordenar)
- [ ] Página admin de datos de pago (alias, CBU, titular)
- [ ] El botón WA en cada tarjeta de pedido abre la previsualización según el estado

**Criterio de éxito:** El stock se descuenta automáticamente al señar/pagar, se restaura al cancelar, los costos quedan congelados al momento de la transacción, y cada cambio de estado ofrece un mensaje WA contextual editable antes de enviar.

---

### FASE 5 — Descuentos ✅ COMPLETADA

> **Objetivo:** Aplicar descuentos y recargos a pedidos o ítems individuales, visibles en reportes.

- [x] Agregar campos a la DB:
  - `pedido_items.descuento_porcentaje` (NUMERIC, nullable)
  - `pedido_items.descuento_monto` (NUMERIC, nullable)
  - `pedido_items.recargo_porcentaje` (NUMERIC, nullable)
  - `pedido_items.recargo_monto` (NUMERIC, nullable)
  - `pedidos.descuento_global_porcentaje` (NUMERIC, nullable)
  - `pedidos.recargo_global_porcentaje` (NUMERIC, nullable)
- [x] Actualizar motor de cálculo:
  - Descuento por ítem: se aplica al subtotal del ítem (después de copias)
  - Recargo por ítem: se aplica al subtotal del ítem (después de copias y descuentos)
  - Descuento global: se aplica al total del pedido (después de descuentos y recargos por ítem)
  - Recargo global: se aplica al total del pedido (después de descuentos globales)
  - Prioridad: ítem primero (descuento, luego recargo), luego global (descuento, luego recargo)
  - El descuento reduce el precio de venta pero NO el costo → reduce la ganancia
  - El recargo aumenta el precio de venta pero NO el costo → aumenta la ganancia
- [x] UI: selector de descuento y recargo en el formulario (%, monto fijo, o ninguno)
- [x] Mostrar descuento y recargo (tachado y resaltado) en tarjeta de pedido, en el carrito y en el presupuesto WA
- [ ] Reportes: total de descuentos y recargos otorgados por período

**Criterio de éxito:** Se pueden aplicar descuentos y recargos por ítem y por pedido, y los reportes reflejan el impacto en la ganancia.

---

### FASE 6 — Historial, reportes y rentabilidad

> **Objetivo:** Visibilidad total de la operación: historial filtrable, reportes de ganancia real, alertas de rentabilidad.

#### Página de Historial

- [ ] Filtros combinables:
  - Rango de fechas (hoy, esta semana, este mes, rango custom)
  - Estado (todos, entregados, pendientes, cancelados)
  - Cliente (búsqueda)
  - Tipo de trabajo (B&N, color, anillado)
- [ ] Paginación o scroll infinito
- [ ] Búsqueda libre (nombre de archivo, cliente, observaciones)
- [ ] Exportar a CSV

#### Página de Reportes

- [ ] **Dashboard de rentabilidad** (cards con KPIs):
  - Ingresos brutos del período
  - Costo total de insumos consumidos
  - Ganancia neta real (ingresos − costos)
  - Margen promedio (%)
  - Pedidos totales / pedidos cancelados
  - Descuentos otorgados
  - Comisiones pagadas (Avru)
- [ ] **Desglose por tipo de trabajo**: B&N vs Color, simple vs doble faz, con y sin anillado
- [ ] **Insumos más consumidos**: ranking de insumos por cantidad y costo
- [ ] **Evolución temporal**: gráfico de ingresos / costos / ganancia por día/semana/mes
- [ ] **Alertas automáticas**:
  - Stock bajo (mostrar en dashboard principal)
  - Margen negativo en algún tipo de trabajo (perdiendo plata)
  - Precio de insumo aumentó más del X% → sugerencia de actualizar precios de venta
- [ ] Librería de gráficos: Recharts (integración nativa con React)

**Criterio de éxito:** El administrador puede responder en cualquier momento: "¿estoy ganando o perdiendo plata? ¿en qué tipo de trabajo? ¿cuánto me cuesta cada insumo?"

---

### FASE 7 — Navegación, UX Mobile-first y PWA (en progreso)

#### Mejora 2026-03-15: Sidebar global desktop

- Se implementa un componente SidebarNav reutilizando el array de navegación de BottomNav.
- El menú lateral aparece en desktop (≥1024px) y mantiene la experiencia mobile con BottomNav.
- Se elimina duplicación de lógica de navegación.
- La navegación es consistente y DRY en ambos modos.

> **Objetivo:** Interfaz profesional, 100% mobile-first, navegación clara, roles diferenciados, componentes amigables para táctil, y progressive web app.

#### Navegación

**Desktop (≥1024px):** Sidebar colapsable a la izquierda.

```
┌─────────────────────────────────────┐
│ GESTIÓN MONI                   👤   │
├──────────┬──────────────────────────┤
│ 📋 Pedidos│  (contenido principal)  │
│ ➕ Nuevo  │                          │
│ 📦 Insumos│                          │
│ 💰 Precios│                          │
│ 🖨️ Equipos│                          │
│ 📊 Reportes                          │
│ ⚙️ Config │                          │
└──────────┴──────────────────────────┘
```

**Mobile (<1024px):** Bottom navigation bar fija con 4-5 tabs + menú hamburguesa para secciones secundarias.

```
┌─────────────────────────────────┐
│        (contenido principal)    │
│                                 │
│                                 │
├─────────────────────────────────┤
│ 📋    ➕    📦    📊    ☰      │
│Pedidos Nuevo Insumos Report Más │
└─────────────────────────────────┘
```

#### Dos modos de uso

- **Modo operador (uso diario):** Pedidos, Nuevo pedido, envío WA. Pantalla limpia, flujo rápido.
  - El formulario de nuevo pedido mantiene su diseño ágil actual.
  - El operador NO ve costos, márgenes ni reportes financieros.
  - Bottom nav reducido: Pedidos, Nuevo, Más (solo lo esencial).
- **Modo administrador:** Todo lo anterior + Insumos, Precios, Equipos, Reportes, Configuración.
  - Ve desglose de costos y ganancia por pedido.
  - Puede cargar compras de insumos, ajustar precios, ver reportes.
  - Bottom nav completo con todas las secciones.

> **Nota:** Ambos roles ya existen en el sistema de Custom Claims (Fase 1). Aquí se activan en la UI.

#### Reglas de componentes Mobile-first

La app se usa mayoritariamente desde celular. **Todos los componentes deben diseñarse primero para pantalla táctil.**

##### Prohibido (NUNCA usar)

| Componente                            | Problema                                    | Reemplazo                                                         |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `window.confirm()` / `window.alert()` | Feo, no personalizable, UX pobre            | **ConfirmSheet** (bottom sheet animado)                           |
| `<dialog>` / modales centrados        | Se cortan en pantalla chica, difícil cerrar | **Bottom Sheet** (sube desde abajo, swipe para cerrar)            |
| `<select>` nativo                     | Tiny, difícil de usar en táctil             | **ActionSheet** (lista de opciones a pantalla completa en mobile) |
| Tooltips en hover                     | No existen en táctil                        | **Texto inline** o iconos con label                               |
| Tablas anchas                         | Scroll horizontal = mala UX                 | **Cards apiladas** o **lista colapsable**                         |
| Inputs sin padding                    | Difícil tocar                               | Mínimo `p-4` (48px zona táctil = accesibilidad)                   |

##### Componentes UI base requeridos

| Componente          | Uso                                                                                                                 | Implementación              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **BottomSheet**     | Reemplaza todos los modales. Sube desde abajo, overlay, swipe-to-close. En desktop se comporta como drawer lateral. | Headless UI o framer-motion ✅ Implementado (`BottomSheet.tsx`) |
| **ActionSheet**     | Reemplaza `<select>` cuando hay 4+ opciones. Lista de opciones con radio/check, barra de búsqueda si hay muchas.    | Custom sobre BottomSheet    |
| **ConfirmSheet**    | Reemplaza confirm dialogs. Título, mensaje, botón peligroso rojo, botón cancelar.                                   | Custom sobre BottomSheet ✅ Implementado (`ConfirmSheet.tsx`)   |
| **Combobox tactil** | Para seleccionar insumos, clientes, espirales. Input con búsqueda + lista filtrada.                                 | Headless UI Combobox        |
| **NumberStepper**   | Para cantidades (páginas, copias). Botones +/- grandes a los lados del número.                                      | Custom                      |
| **SwipeActions**    | En listas de pedidos: swipe izquierda = borrar, swipe derecha = WA. Ahorra botones.                                 | Custom o librería           |
| **Toast**           | Notificaciones breves. Ya existe, mantener.                                                                         | Existente                   |
| **SkeletonLoader**  | Loading states para cada sección.                                                                                   | Custom                      |

##### Zona táctil mínima

Todo elemento interactivo debe tener un mínimo de **44×44px** (Apple HIG) / **48×48dp** (Material). Esto incluye:

- Botones
- Items de lista clickeables
- Checkboxes y radios
- Iconos de acción

##### Formulario de nuevo pedido (mobile)

```
┌─────────────────────────────┐
│ ← Nuevo Pedido              │
├─────────────────────────────┤
│ Cliente:  [Juan Pérez     ] │
│                             │
│ ┌─────┐ ┌─────┐ ┌────────┐ │
│ │ - 45 + │ │ - 1 +  │ │ B&N ▸  │ │  ← NumberStepper + ActionSheet
│ │ Págs  │ │ Copias │ │ Tinta  │ │
│ └───────┘ └───────┘ └────────┘ │
│                             │
│ ☐ Doble faz    ☐ Solo anillar│
│                             │
│ Anillado: [Sin anillado ▸ ] │  ← ActionSheet con medidas mm
│ Tapa:     [Negro ▸        ] │  ← ActionSheet con colores
│ Extras:   ☐ Bolsa  ☐ Clips  │
│                             │
│ ┌───────────────────────────┐│
│ │  ➕ AÑADIR AL PEDIDO      ││  ← Botón grande, full-width
│ └───────────────────────────┘│
│                             │
│ ═══ CARRITO (2 items) ═══   │
│ • 45pág B&N SF ×1    $1.575 │  ← Swipe para borrar
│ • 20pág COLOR DF ×2  $4.400 │
│                             │
│ TOTAL: $5.975               │
│                             │
│ ┌───────────────────────────┐│
│ │  ✅ FINALIZAR PEDIDO      ││
│ └───────────────────────────┘│
└─────────────────────────────┘
```

#### Dependencias UI sugeridas

| Librería                     | Uso                                                | Tamaño  |
| ---------------------------- | -------------------------------------------------- | ------- |
| **@headlessui/react**        | Combobox, Listbox, Dialog (accesible, sin estilos) | ~15KB   |
| **framer-motion**            | Animaciones de bottom sheet, swipe gestures        | ~30KB   |
| **react-aria** (alternativa) | Componentes accesibles si Headless UI no alcanza   | Modular |

> **Nota:** NO usar librerías de componentes pesadas (Material UI, Ant Design, Chakra). Se mantiene Tailwind + componentes propios sobre Headless UI.

#### PWA

- [ ] Service Worker con Workbox (cache de assets + fallback offline)
- [ ] Indicador de estado online/offline
- [ ] Loading states y skeleton screens
- [ ] Shortcuts de teclado para el formulario de pedido (solo desktop)
- [ ] Modo oscuro (opcional, baja prioridad)

#### Tareas de implementación

- [x] Crear componente `BottomSheet` (base para todo lo demás)
- [ ] Crear componente `ActionSheet` (reemplaza `<select>` nativo)
- [x] Crear componente `ConfirmSheet` (reemplaza `window.confirm` y `ConfirmModal` actual)
- [ ] Crear componente `NumberStepper` (reemplaza inputs numéricos para páginas/copias)
- [ ] Crear componente `Combobox` (para insumos, clientes, espirales)
- [x] Implementar bottom navigation bar (mobile) + sidebar (desktop)
- [ ] Migrar todos los `<select>` existentes a ActionSheet
- [ ] Migrar `ConfirmModal` existente a ConfirmSheet
- [ ] Responsive-first: rehacer layouts con grid/flex mobile-first
- [ ] Zona táctil: auditar todos los botones/inputs (mínimo 44px)
- [ ] Service Worker + Workbox
- [ ] Skeleton loaders para cada sección

**Criterio de éxito:** La app es 100% usable desde un celular con una sola mano. No hay modales centrados, no hay selects nativos, no hay confirms del navegador. Todo es amigable, rápido y táctil.

---

### FASE 8 — Testing y calidad (transversal)

> **Objetivo:** Cobertura de tests sobre la lógica de negocio crítica (dinero, stock, costos).

- [ ] Configurar Vitest + React Testing Library
- [ ] Tests unitarios para:
  - `costEngine.ts` (cálculo de costos reales — CRÍTICO)
  - `calculator.ts` / motor de precios de venta
  - `stockEngine.ts` (descuento y restauración de stock)
- [ ] Tests de integración:
  - Crear pedido → señar → verificar stock descontado
  - Cancelar pedido señado → verificar stock restaurado
  - Cambiar precio de insumo → verificar que pedidos viejos mantienen costo congelado
  - Aplicar descuento → verificar que ganancia baja pero costo no cambia
- [ ] Tests E2E con Playwright (flujo de pedido completo)
- [ ] GitHub Actions: CI en cada push
- [ ] ESLint + Prettier

> **Nota:** Los tests del motor de costos son lo más importante. Si el cálculo de ganancia está mal, toda la visibilidad del negocio se distorsiona.

---

## 5. Modelo de Datos Objetivo

### Diagrama de relaciones

```
auth.users
    │
    ├── profiles (role, name)
    │
    ├── pedidos ──────────────────────────────┐
    │     ├── pedido_items                    │
    │     │     └── pedido_items_insumos ─────┤── insumos
    │     └── stock_movimientos ──────────────┘     │
    │                                               ├── insumos_precios_log
    │                                               └── stock_movimientos
    ├── equipos
    │
    ├── precios_impresion
    ├── precios_anillado
    └── config_costos
```

### Tablas del sistema

#### auth.users + profiles (Fase 1 ✅)

Ya implementadas con Custom Claims.

#### pedidos (evolución)

```sql
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_cliente TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('presupuesto','pendiente','señado','pagado','entregado','cancelado')),
  tipo_pago TEXT,
  monto_sena NUMERIC DEFAULT 0,
  total_pedido NUMERIC DEFAULT 0,
  descuento_global_porcentaje NUMERIC,
  costo_total NUMERIC,           -- Costo real (calculado al señar/pagar)
  ganancia NUMERIC,              -- total_pedido - descuentos - costo_total
  stock_descontado BOOLEAN NOT NULL DEFAULT false,
  observaciones TEXT,
  entregado BOOLEAN DEFAULT false,
  pagado BOOLEAN DEFAULT false,
  fecha_pago TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### pedido_items (evolución)

```sql
CREATE TABLE pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  paginas INTEGER NOT NULL,
  copias INTEGER NOT NULL DEFAULT 1,
  tipo_impresion TEXT NOT NULL,        -- 'bn' | 'color'
  doble_faz BOOLEAN DEFAULT false,
  anillado_mm INTEGER,                 -- null = sin anillado, 7-33 = medida
  color_tapa TEXT,                     -- null = Negro (default), o color elegido
  incluye_bolsa BOOLEAN DEFAULT false,
  incluye_clips BOOLEAN DEFAULT false,
  incluye_bolsa_propileno BOOLEAN DEFAULT false,
  sobrina_trabajo BOOLEAN DEFAULT false,
  precio_unitario NUMERIC NOT NULL,    -- precio por hoja al momento del pedido
  precio_anillado NUMERIC DEFAULT 0,   -- precio de anillado al momento del pedido
  subtotal_item NUMERIC NOT NULL,
  costo_item NUMERIC,                  -- costo real (congelado al señar/pagar)
  descuento_porcentaje NUMERIC,
  descuento_monto NUMERIC,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### insumos

```sql
-- Ver definición completa en Fase 3A
```

#### equipos

```sql
-- Ver definición completa en Fase 3B
```

#### precios_impresion, precios_anillado, config_costos

```sql
-- Ver definición completa en Fase 3C
```

#### pedido_items_insumos

```sql
-- Ver definición completa en Fase 3C
-- Registra el consumo congelado de insumos por cada item al señar/pagar
```

#### stock_movimientos, insumos_precios_log

```sql
-- Ver definición completa en Fase 3A
-- Auditoría de stock y precios de compra
```

---

## 6. Decisiones de Migración

### Estrategia: Rewrite progresivo (no migración in-place)

- Se crea un proyecto React nuevo en un directorio/repositorio separado.
- Se mantiene la app actual funcional hasta que la nueva alcance paridad (Fase 0).
- Una vez validada, se hace el switch de DNS/deploy.
- La base de datos Supabase se mantiene; solo se agregan columnas/tablas nuevas.

### Variables de entorno

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ENV=development|production
```

### Deploy

- **Recomendación:** Vercel (integración nativa con Vite + previews por PR)
- **Alternativa:** Netlify o GitHub Pages con GitHub Actions
- **CI:** GitHub Actions → lint + test + build + deploy

---

## 7. Priorización Sugerida

| Prioridad | Fase                             | Valor de negocio                                             |
| --------- | -------------------------------- | ------------------------------------------------------------ |
| 🔴 Alta   | Fase 0 — Scaffolding             | Base técnica para todo lo demás ✅                           |
| 🔴 Alta   | Fase 1 — Auth                    | Seguridad, multi-usuario ✅                                  |
| 🔴 Alta   | Fase 2 — Copias                  | Funcionalidad pedida frecuentemente ✅                       |
| 🔴 Alta   | Fase 3A — Insumos y stock        | Sin esto no hay costos reales                                |
| 🔴 Alta   | Fase 3B — Equipos y amortización | Necesario para costo por página real                         |
| 🔴 Alta   | Fase 3C — Precios y motor costos | Corazón del sistema de rentabilidad                          |
| 🔴 Alta   | Fase 4 — Estados y stock auto    | Datos fieles = reportes fieles                               |
| 🟡 Media  | Fase 5 — Descuentos              | Operativa diaria, afecta ganancia                            |
| 🟡 Media  | Fase 6 — Historial y reportes    | Visibilidad de rentabilidad                                  |
| 🟡 Media  | Fase 7 — Mobile-first, UX y PWA  | Base UI para todo lo demás (celular = dispositivo principal) |
| 🟢 Normal | Fase 8 — Testing                 | Calidad continua (transversal a todas las fases)             |

---

## 8. Estimación de Complejidad

| Fase | Complejidad | Archivos nuevos/modificados aprox.               |
| ---- | ----------- | ------------------------------------------------ |
| 0    | Alta        | ~25-30 (scaffolding completo) ✅                 |
| 1    | Media       | ~5-8 (auth + RLS) ✅                             |
| 2    | Baja        | ~6 (columna + UI + calc) ✅                      |
| 3A   | Media       | ~8-10 (tabla insumos + UI completa + stock)      |
| 3B   | Baja        | ~4-5 (tabla equipos + UI + cálculo amort)        |
| 3C   | Alta        | ~12-15 (motor costos + migración + precios UI)   |
| 4    | Alta        | ~8-10 (máquina estados + stock auto + auditoría) |
| 5    | Media       | ~5-6 (campos + UI + cálculo)                     |
| 6    | Alta        | ~10-12 (páginas + filtros + gráficos + KPIs)     |
| 7    | Alta        | ~12-15 (componentes UI + nav + responsive + PWA) |
| 8    | Transversal | Tests por cada módulo crítico                    |

---

## 9. Notas Técnicas

- **Supabase Types:** Generar tipos automáticos con `supabase gen types typescript` para mantener sync DB ↔ TS.
- **Migraciones:** Usar Supabase CLI para versionado de schema (`supabase migration`).
- **Estado del carrito:** Zustand con `persist` middleware → sobrevive a refresco de página.
- **Cálculos de dinero:** Usar enteros (pesos sin centavos) ya que así se maneja en el negocio. Si en el futuro se necesitan centavos, considerar `dinero.js`.
- **Comisiones:** El modelo actual de "sobrina" (Avru) puede generalizarse a una tabla de comisiones para permitir más trabajadores en el futuro.
- **Motor de costos:** Es el componente más crítico. Debe ser puro (sin side effects), 100% testeable, y recibir todos los datos como parámetros (no fetchear internamente).
- **Congelado de costos:** Cuando un pedido se señala/paga, los costos se graban en `pedido_items_insumos`. Si luego cambia el precio de un insumo, los pedidos viejos mantienen el costo histórico correcto.
- **Impresoras:** No se distingue al cliente si es tinta o láser, pero internamente el sistema debe poder calcular el costo por página según los insumos de cada tipo (tinta o tóner). El costo de amortización de equipos se promedia o se configura manualmente.
- **Papel:** Costo por hoja = precio_compra_resma / hojas_por_resma. Si se agregan otros tipos de papel, el sistema lo soporta via la tabla `insumos` con `tipo_papel` diferente.
- **Flexibilidad de insumos:** La tabla `insumos` con categoría flexible permite agregar nuevos tipos (bolsas de propileno, clips, etc.) sin cambiar el schema. El motor de costos debe recibir una lista de insumos asociados al item y sumarlos.

---

## 10. Principios de Diseño

### Mobile-first (regla #1)

- **El celular es el dispositivo principal.** Todo se diseña primero para 375px de ancho.
- **Desktop es una mejora**, no al revés. En desktop se aprovecha el espacio extra, pero no se requiere.
- **Un dedo, una mano.** Los botones de acción principales deben estar al alcance del pulgar (zona inferior de la pantalla).
- **Sin zoom:** Tamaños de fuente mínimo 16px en inputs (evita auto-zoom en iOS).
- **Sin scroll horizontal.** Nunca. Si no entra, se apila verticalmente o se usa cards.

### Para el operador (persona que toma pedidos)

- **Velocidad primero:** El formulario de nuevo pedido debe permitir cargar un pedido típico en menos de 30 segundos.
- **Pantalla limpia:** No mostrar costos, márgenes ni información financiera.
- **WhatsApp contextual:** Cada estado del pedido tiene su mensaje prellenado. El operador puede editarlo antes de enviar. No necesita pensar qué escribir.
- **Mínimas decisiones:** Los valores por defecto deben ser los más comunes (B&N, simple faz, sin anillado, 1 copia).
- **Feedback inmediato:** Toda acción tiene confirmación visual (toast, animación). Nunca queda la duda de "¿se guardó?".

### Para el administrador

- **Visibilidad total:** Cada pedido muestra precio de venta, costo real y ganancia.
- **Todo editable:** Precios, plantillas WA, datos de pago, insumos, equipos — todo se configura desde la app, nunca desde código ni SQL.
- **Alertas proactivas:** Stock bajo, márgenes negativos, precios de insumos desactualizados.
- **Reportes accionables:** No solo datos, sino insights ("Tu margen promedio en B&N bajó un 15% este mes, revisá el precio del tóner").
- **Trazabilidad:** Cualquier número se puede rastrear hasta su origen (qué insumos, a qué costo, en qué momento).

### Comunicación con el cliente (WhatsApp)

- **Cada estado tiene su plantilla:** Presupuesto, confirmación de seña, aviso de listo, cancelación.
- **Personalizable antes de enviar:** Se muestra una previsualización editable a pantalla completa.
- **Datos de pago dinámicos:** Se inyectan automáticamente si la plantilla los incluye. Alias, CBU y titular se administran desde la app.
- **Log opcional:** Se puede registrar que se envió un mensaje (para no repetir envíos).

---

_Este documento es un plan vivo. Se actualiza a medida que se completan fases y surgen nuevos requerimientos._

_Última actualización: 16 de marzo de 2026 — Actualización de estados de fases, deploy y UI._
