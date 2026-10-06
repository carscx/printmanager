# PrintManager — SPA (React + Vite)

La aplicación web vive en la **raíz del repositorio** (`package.json`, `src/`, `index.html`).

## Requisitos

- **Node.js 20+** (recomendado la LTS actual).

### Proyecto movido desde una subcarpeta (por qué “antes iba” y ahora no)

**Mover el código a la raíz no rompe npm por sí solo**: el `package.json` es el mismo. Lo que suele cambiar es **cómo** instalás:

1. **En la subcarpeta** seguramente tenías **`package-lock.json`** y/o una carpeta **`node_modules`** ya generada. El lockfile **congela** versiones exactas (por ejemplo Vite 7.x). Aunque en `package.json` figure `vite: "^8.0.0"`, una instalación anterior pudo dejar resuelto el árbol sin volver a pasar por el conflicto actual.

2. **Al pasar a la raíz**, si **no copiaste** el `package-lock.json` (o lo borraste junto con `node_modules`), `npm install` hace una **resolución nueva** solo mirando rangos semver del `package.json`. Ahí npm puede elegir **Vite 8** y chocar con `vite-plugin-pwa`, que en npm declara peers solo hasta Vite 7 → error **`ERESOLVE`**. Eso no es “la raíz del repo”: es **instalación limpia sin lockfile**.

3. **Qué hacer**: en este repo **`vite` está acotado a `^7.0.0`** para alinearse con el plugin PWA; conviene **commitear** el `package-lock.json` de la raíz cuando lo generes, así no se repite el problema. Si en git todavía existe el lock viejo en la subcarpeta, podés recuperarlo:  
   `git show HEAD:printmanager-react/package-lock.json > package-lock.json` (ajustá la ruta si era otra) y luego `npm install`.

4. **Si “no arranca” `npm install`** (no imprime nada o se cuelga): comprobá que estás en la carpeta donde está **`package.json`** (`ls package.json`), que Node/npm existen (`node -v`, `npm -v`) y que no estás mezclando otra carpeta (por ejemplo instalando en `evolution-api/` por error).

## Instalar dependencias

En la raíz del repo (donde está este `README` y `package.json`):

```bash
npm install
```

Eso crea `node_modules/` y genera o actualiza **`package-lock.json`**.

### Si algo falla

1. **Estás en la carpeta correcta**  
   Tiene que existir `package.json` en el directorio actual. Si antes estaba todo en `printmanager-react/`, ahora el comando es desde la raíz del clon, no dentro de una subcarpeta antigua.

2. **No uses `npm ci` todavía**  
   `npm ci` **exige** un `package-lock.json` ya presente. Si lo borraste al mover carpetas, primero ejecutá **`npm install`** una vez; después podés usar `npm ci` en CI si commiteás el lockfile.

3. **Limpiar e instalar de nuevo**

   ```bash
   rm -rf node_modules
   npm install
   ```

4. **`ERESOLVE` entre Vite y `vite-plugin-pwa`**  
   El plugin PWA declara en npm peers solo hasta **Vite 7**; con **Vite 8** npm puede fallar con `unable to resolve dependency tree`. En este repo **`vite` está fijado a `^7.0.0`** para que `npm install` sea directo.  
   Si subís manualmente a Vite 8 antes de que el plugin actualice sus `peerDependencies`, podés instalar con:

   ```bash
   npm install --legacy-peer-deps
   ```

5. **Otros conflictos de peer dependencies**  
   Si aparece otro `ERESOLVE`, probá también `npm install --legacy-peer-deps` como último recurso.

6. **WSL**  
   Cloná el repo en el filesystem de Linux (p. ej. `~/proyectos/...`), no en `/mnt/c/...`, para evitar problemas lentos o raros con `node_modules`.

## Scripts

| Comando        | Descripción        |
|----------------|--------------------|
| `npm run dev`    | Servidor de desarrollo (Vite) |
| `npm run build`  | Build de producción   |
| `npm run preview`| Previsualizar el build |
| `npm run lint`   | ESLint               |

## Otros directorios

- **`api/`** — API NestJS (JWT + PostgreSQL). Ver `docker-compose.yml`.
- **`sql/`** — scripts SQL canónicos; instalación self-host en `sql/selfhost/`.
- **`scripts/`** — backup/restore desde Supabase y cutover (`scripts/CUTOVER.md`).
- **`evolution-api/`** — otro proyecto con su propio `package.json`; sus dependencias se instalan **dentro de esa carpeta**, no en la raíz.

## PWA y caché del Service Worker

- **`registerType: "prompt"`** en `vite.config.ts`: el usuario confirma la actualización vía `ReloadPrompt` en la UI.
- **Iconos del manifest**: colocá **`public/web-app-manifest-512x512.png`** (512×512, PNG). Vite lo publica como `/web-app-manifest-512x512.png` y está referenciado en el manifest y en `apple-touch-icon` en `index.html`.
- **Docker / Nginx**: `Dockerfile` en la raíz sirve el `dist` con `docker/nginx-spa.conf`, que envía **`Cache-Control: no-store`** para `sw.js` y los JS de Workbox. Si usás Nginx sin Docker, replicá esas directivas `location` en tu `server` (o incluí el fragmento de `docker/nginx-spa.conf`).
- **Iconos Font Awesome**: se cargan desde el paquete npm `@fortawesome/fontawesome-free` (en `main.tsx`), no desde CDN, para evitar avisos de *Tracking Prevention* en Edge y depender menos de terceros.

### Producción: errores típicos en consola

1. **`manifest.webmanifest` 404 y `bad-precaching-response` (Workbox)**  
   Tras `npm run build`, comprobá que en **`dist/`** exista **`manifest.webmanifest`**. Con **Vite 8 (Rolldown)**, `vite-plugin-pwa` no puede emitir ese archivo al bundle (la asignación al `bundle` se ignora); en este repo el contenido viene de **`public/manifest.webmanifest`**, copiado a `dist/`. Si cambiás el objeto `manifest` en `vite.config.ts`, actualizá también `public/manifest.webmanifest` (mismo JSON que generaría el plugin, incluyendo merges por defecto como `lang`), o el precache del SW puede fallar por hash distinto. Subí **todo** el contenido de `dist/` al hosting. El fragmento Nginx incluye `location = /manifest.webmanifest` con tipo `application/manifest+json`.

2. **Logs `background.js`, Bitwarden, SignalR, WASM**  
   No vienen de PrintManager: son de la **extensión del navegador** (p. ej. Bitwarden). Probá en ventana de incógnito **sin extensiones** o ignorá esas líneas.

3. **Supabase `403` / `permission denied for table pedidos`**  
   Es **RLS/políticas** en Supabase (el JWT no tiene permiso sobre `pedidos`). Revisá políticas y roles en el SQL del proyecto (`sql/`, p. ej. `02_auth_rls.sql`) y en el panel de Supabase.

---

Plantilla Vite original: plugins React, ESLint, etc. ([Vite](https://vite.dev/), [React](https://react.dev/)).
