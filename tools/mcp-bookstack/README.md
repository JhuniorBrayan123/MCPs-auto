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

**NO** se commitean. El server es **autocontenido**: carga las variables
`BOOKSTACK_*` desde un `.env` propio de **esta misma carpeta** (junto a
`package.json`), por ruta explícita en `src/index.ts` (no depende del cwd
ni de variables provistas por OpenCode). Copiá `.env.example` como `.env`
acá mismo y completá:

```
BOOKSTACK_BASE_URL=https://tu-bookstack.com
BOOKSTACK_TOKEN_ID=tu_token_id
BOOKSTACK_TOKEN_SECRET=tu_token_secret
```

Este mismo `.env` también lleva `MCP_TRANSPORT`/`MCP_OAUTH_ISSUER_URL`/`AVP_*`
para el despliegue streamable-http -- ver la sección más abajo. No hay
ningún `.env` compartido con los demás MCPs: cada carpeta se copia y
despliega de forma independiente.

### ¿Por qué NO usar placeholders `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro (no admite comentarios) y OpenCode **no auto-carga**
ningún `.env` para resolver los placeholders de entorno (`env:VARIABLE`).
Si la variable no está exportada en el entorno real del proceso, el placeholder
se sustituye por una cadena vacía y el MCP arranca roto **silenciosamente** (el
server lanza una excepción al validar credenciales). Por eso el server resuelve
su propio `.env` por ruta explícita y no confía en placeholders de `opencode.json`.

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

> El MCP arranca con el token de su propio `.env`. Para que una nueva tool quede activa
> hay que **reiniciar el MCP** (reabrir la sesión de OpenCode, o detener/relanzar
> el proceso). `npm run build` solo recompila; no recarga el server en curso.

## Streamable-http transport (trusted-issuer + AVP)

Por default (`MCP_TRANSPORT=stdio`, o sin setear) este server se comporta
exactamente igual que antes: proceso local, stdin/stdout, sin red, sin auth.
Con `MCP_TRANSPORT=streamable-http` expone `POST` en el path que indique
`MCP_PUBLIC_URL` (bind en `MCP_HOST`/`MCP_PORT`) -- en este despliegue,
`https://mcp.gutierrezautomotriz.com/bookstack/mcp`, detrás del mismo ALB
que ya expone [`../../../mcp-oauth-proxy`](../../../mcp-oauth-proxy) en la
raíz del dominio, enrutando `/bookstack/*` al puerto local de este proceso
(ver [`../../deploy/PORTS.md`](../../deploy/PORTS.md)). El path se toma tal
cual de `MCP_PUBLIC_URL` (`src/transport/http.ts`), así que ese valor debe
coincidir exactamente con la regla del ALB.

Este server es un **resource server puro**: nunca habla con Cognito
directo. El login (Dynamic Client Registration + PKCE + Cognito Hosted UI)
lo maneja `mcp-oauth-proxy`, el único proceso del dominio con ese rol -- acá
solo hace falta `MCP_OAUTH_ISSUER_URL` apuntando a él; no se necesita
ningún campo `COGNITO_*`. Autorizado por tool con **AWS Verified
Permissions**, vía
[`mcp-cognito-avp`](https://smartreasons-983698321034.d.codeartifact.us-west-2.amazonaws.com/npm/erp2-npm/)
(paquete privado en CodeArtifact -- ver "Instalación" abajo).

### Instalación

`mcp-cognito-avp` vive solo en `erp2-npm` (privado). Este repo's `.npmrc`
apunta el registro *default* directo a `erp2-npm`:

```
registry=https://smartreasons-983698321034.d.codeartifact.us-west-2.amazonaws.com/npm/erp2-npm/
```
Solo hace falta un login vigente de
CodeArtifact antes de instalar (dura 12h):

```powershell
aws codeartifact login --tool npm --domain smartreasons --domain-owner 983698321034 --repository erp2-npm --region us-west-2
npm install
```

El mapeo tool → acción/recurso Cedar vive en
`src/tools/tool_authorization_map.ts`, y el schema + políticas de ejemplo
de este server en [`../../deploy/avp/bookstack/`](../../deploy/avp/bookstack).
