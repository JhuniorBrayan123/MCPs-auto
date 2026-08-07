# MCP BookStack (vendored)

Servidor MCP local para consultar y documentar en **BookStack** (fuente de la verdad del
agente QA). Está versionado dentro de este repo para que todo el equipo lo use igual.

## Setup (una sola vez por máquina)

```bash
npm install
npm run build
```

Esto genera `dist/` (ignorado por git). El MCP se registra en `opencode.json`
con ruta relativa: `node tools/mcp-bookstack/dist/index.js`.

## Credenciales

**NO** se commitean. El server carga las variables `BOOKSTACK_*` desde el `.env`
de la **raíz del proyecto** como **única fuente**, por ruta explícita en
`src/index.ts`: `resolve(here, "../../../.env")` (desde `dist/` o `src/` sube
tres niveles hasta la raíz del repo). No depende del cwd ni de variables
provistas por OpenCode. El `.env.example` de esta carpeta es solo documentación
(no se copia como `.env` local):

```
BOOKSTACK_BASE_URL=https://tu-bookstack.com
BOOKSTACK_TOKEN_ID=tu_token_id
BOOKSTACK_TOKEN_SECRET=tu_token_secret
```

### ¿Por qué NO usar placeholders `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro (no admite comentarios) y OpenCode **no auto-carga**
el `.env` de la raíz para resolver los placeholders de entorno (`env:VARIABLE`).
Si la variable no está exportada en el entorno real del proceso, el placeholder
se sustituye por una cadena vacía y el MCP arranca roto **silenciosamente** (el
server lanza una excepción al validar credenciales). Por eso el server resuelve
el `.env` raíz por ruta explícita y no confía en placeholders de `opencode.json`.

> El token de BookStack se crea en **Admin > API Tokens**. Verifica que el
> `TOKEN_ID` tenga todos sus caracteres (incluye el `0` inicial si existe).

## Uso

- `npm run dev` — ejecuta el servidor en modo desarrollo (`tsx`)
- `npm run build` — compila TypeScript a `dist/`
- `npm start` — ejecuta el servidor compilado

## Tools expuestas

### Lectura / navegación
- `bookstack_list_books` / `bookstack_list_chapters` / `bookstack_list_shelves`
- `bookstack_get_book` / `bookstack_get_chapter` / `bookstack_get_shelf`
- `bookstack_get_page` / `bookstack_list_pages` (filtrable por `bookId` / `chapterId`)
- `bookstack_search`

### Escritura (dryRun por defecto)
- `bookstack_create_page` / `bookstack_update_page`

> El MCP arranca con el token del `.env` raíz. Para que una nueva tool quede activa
> hay que **reiniciar el MCP** (reabrir la sesión de OpenCode, o detener/relanzar
> el proceso). `npm run build` solo recompila; no recarga el server en curso.
