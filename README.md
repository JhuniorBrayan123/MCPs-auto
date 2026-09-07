# 🧩 MCP Stack — Suite de servidores MCP para QA Automation

Stack de **servidores MCP (Model Context Protocol)** que potencia a los agentes de
IA dentro de **OpenCode**. Es la receta reproducible para que cualquier proyecto
(incluido el de QA automática/ERP) tenga conectados GitLab, BookStack, SQL Server,
ELK Observability, Engram, Context7 y Excalidraw en minutos.

> **Privacidad**: este repo es una **plantilla**. No contiene credenciales ni
> URLs internas de ninguna organización. Cada quien rellena su propio `.env`.

---

## 📚 ¿Qué hay en este stack?

| # | MCP | Tipo | ¿Qué hace? | Setup |
|---|-----|------|------------|-------|
| 1 | **BookStack** | 🧑‍💻 Propio (Node/TS) | Consultar y documentar en BookStack (wiki del agente QA) | `cd tools/mcp-bookstack && npm install && npm run build` |
| 2 | **GitLab** | 🧑‍💻 Propio (Python) | Leer/operar GitLab: MRs, diffs, pipelines, archivos | `pip install -r tools/mcp-gitlab/requirements.txt` |
| 3 | **SQL Server** | 🧑‍💻 Propio (Node/TS) | Consultar y operar SQL Server (bases `crt` y `prd`) | `cd tools/mcp-sqlserver && npm install && npm run build` |
| 4 | **Engram** | 🛠️ CLI instalada | Memoria persistente entre sesiones | [guía de instalación](https://github.com/Gentleman-Programming/engram) + `engram mcp` |
| 5 | **Context7** | ☁️ Remoto | Documentación actualizada de librerías/frameworks | ninguno (URL remota) |
| 6 | **Excalidraw** | 📦 open-source | Diagramas editables en canvas | `npx mcp-excalidraw-server` (opcional) |
| 7 | **ELK Observability** | 🧑‍💻 Vendorizado (Node/TS, origen: GP-DevOps) | Observabilidad APM/Elasticsearch de solo lectura (servicios, endpoints, latencia, errores, trazas) para correlacionar fallas de QA con datos reales | `cd tools/mcp-elk-observability && npm install && npm run build` |

**Cuatro tienen el código real dentro de este repo** (`tools/mcp-bookstack`,
`mcp-gitlab`, `mcp-sqlserver`, `mcp-elk-observability` — este último originado
por GP-DevOps, copiado aquí para que un `git clone` normal traiga todo sin
depender de otro repositorio) y **tres son herramientas externas de terceros**
que solo se configuran. Este repo los une en una sola receta.

---

## 🚀 Quickstart

```bash
# 1. Clona el repo (un git clone normal trae TODO el código, sin pasos extra)
git clone <url-de-este-repo>
# 2. Crea tu .env a partir del ejemplo
cp .env.example .env
# 3. Llena .env con TUS credenciales
# 4. Instala dependencias de BookStack
cd tools/mcp-bookstack && npm install && npm run build && cd ../..
# 5. Instala dependencias de GitLab
pip install -r tools/mcp-gitlab/requirements.txt
# 6. Instala dependencias de SQL Server
cd tools/mcp-sqlserver && npm install && npm run build && cd ../..
# 7. Instala dependencias del MCP ELK Observability
cd tools/mcp-elk-observability && npm install && npm run build && cd ../..
# 8. Fusiona opencode.config.example.json en tu opencode.json
```

> 📋 Guía paso a paso completa en [`docs/SETUP.md`](docs/SETUP.md).

---

## 🏗️ Arquitectura

```
proyecto/
├── .env                             ← ÚNICA fuente de credenciales (NO versionado)
├── opencode.json / .mcp.json        ← registran los MCPs
├── tools/
│   ├── mcp-bookstack/               ← código propio (Node/TS)
│   ├── mcp-gitlab/                  ← código propio (Python)
│   ├── mcp-sqlserver/               ← código propio (Node/TS) — SRExcepcion
│   ├── mcp-elk-observability/       ← vendorizado (origen: GP-DevOps)
│   └── launch-mcp-elk-observability.mjs  ← wrapper que le inyecta el .env raíz
└── docs/
    └── *.excalidraw          ← escenas de diagramas (Excalidraw)
```

Los MCPs locales (**BookStack** y **GitLab**) leen sus credenciales desde el
`.env` de la **raíz del proyecto** por ruta explícita. Esto los hace
independientes del directorio de trabajo y de placeholders de OpenCode.

### ¿Por qué leer el `.env` por ruta y no usar `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro y OpenCode **no auto-carga** el `.env` de la raíz
para resolver placeholders. Si la variable no está en el entorno real del
proceso, el placeholder se sustituye por una cadena vacía y el MCP arranca roto
**silenciosamente**. Por eso los servidores locales resuelven `.env` por ruta
explícita y no confían en placeholders.

---

## 🔐 Seguridad

- El `.env` **nunca** se versiona (está en `.gitignore`).
- Los `.env.example` de este repo (raíz y de cada MCP) son **solo documentación**,
  contienen placeholders, jamás credenciales.
- Si quieres hacer este repo **público**, verifica que ninguna URL interna ni
  token quede en el historial (ver `docs/SETUP.md` → "Antes de publicar").
- Para un repo compartido con el equipo usa **privado**.

---

## 🧭 MCPs de terceros (referencia, no re-vendorizados)

- **Engram** — memoria persistente; instalar desde su [guía de instalación](https://github.com/Gentleman-Programming/engram); la config entra como `engram mcp`.
- **Context7** — MCP remoto `https://mcp.context7.com/mcp`; sin instalación local.
- **Excalidraw** — paquete npm open-source `mcp-excalidraw-server`; opcional, para
  diagramas editables; se instala con `npx` (no se copia en `tools/`).

---

## 🤖 Gentle AI — orquestador (no es un MCP)

**Gentle AI** no es un MCP de este stack: es el **orquestador** que dota al agente de
**skills** (SDD, cluster de Azure, etc.) y cohesiona los MCPs en un flujo de trabajo.
Se instala por separado y orquesta cómo se usan Engram, Context7, GitLab y BookStack.
Ver su [guía de instalación](https://github.com/Gentleman-Programming/gentle-ai).

> Resumen del ecosistema:
> - **Gentle AI** = orquestador + skills (define el **cómo**).
> - **MCPs de este stack** = herramientas conectadas (definen el **con qué**).

---

## 🛠️ Herramientas expuestas por los MCPs propios

### BookStack (`tools/mcp-bookstack`)
- `list_books` / `list_chapters` / `search` / `get_page`
- `create_page` / `update_page` (dryRun por defecto)

### GitLab (`tools/mcp-gitlab`)
- `search_projects` / `get_repository_tree` / `get_file_content`
- `list_merge_requests` / `get_merge_request` / `get_merge_request_diff`
- `get_merge_request_comments` / `get_merge_request_pipelines` / `get_conflicting_files`
- `create_merge_request` / `update_merge_request` / `approve_merge_request` (escritura, con guardas)

### SQL Server (`tools/mcp-sqlserver`) — solo lectura
- `sqlserver_query` — Ejecutar una consulta de solo lectura (SELECT/WITH; el resto se bloquea)
- `sqlserver_get_schema` — Obtener esquema (tablas, vistas, procedimientos) de la base de datos
- `sqlserver_test_connection` — Probar la conexión a la base de datos
- `erp_fallas_resumen` — Resumen de excepciones del log del ERP (por rango de fecha/hora)
- `erp_fallas_por_modulo` — Excepciones agrupadas por módulo
- `erp_anomalias` — Detección de anomalías (picos de errores, no solo el módulo más ruidoso)
- `erp_fallas_rango` — Excepciones en un rango arbitrario

Todas las queries pasan por [`read-only-guard.ts`](tools/mcp-sqlserver/src/read-only-guard.ts),
que bloquea cualquier sentencia de escritura (INSERT/UPDATE/DELETE/DDL). Soporta
múltiples perfiles de conexión (`drt`, `prd`, `dev`) vía variables de entorno.

### ELK Observability (`tools/mcp-elk-observability`) — solo lectura
Código vendorizado desde el repo del equipo GP-DevOps
(`gitlab.sreasons.com/GP-Devops/mcp-elk-observability`) — se copia aquí en vez
de referenciarlo como submódulo, así un `git clone` normal de este repo trae
todo sin depender de otro repositorio ni de acceso a GitLab interno. Como
contrapartida, actualizaciones futuras de GP-DevOps no se sincronizan solas:
hay que volver a copiar los cambios manualmente cuando haga falta.
13 tools de observabilidad APM/Elasticsearch, sin clasificación de salud (no
decide "healthy/degraded" — solo expone datos crudos y deja el juicio al agente):

- `list_services` / `list_endpoints` — descubre servicios y sus endpoints
- `get_service_health` / `get_endpoint_health` — throughput, latencia, error rate
- `get_endpoint_latency` — percentiles p50–p99 de un endpoint
- `get_slow_services` / `get_slow_endpoints` — ranking por percentil de latencia
- `get_service_errors` / `get_endpoint_errors` / `get_top_errors` — desglose de errores 4xx/5xx
- `trace_request` / `get_trace_dependencies` — reconstrucción de trazas y dependencias
- `compare_periods` — comparación de métricas entre dos rangos de tiempo

Garantía de solo lectura por construcción (cliente ES solo usa `search`, nunca
`index/update/delete`). Requiere `ELASTICSEARCH_URL` y `ELASTICSEARCH_API_KEY`
en `.env` — ver el [README propio de este MCP](tools/mcp-elk-observability/README.md)
para la lista completa de variables y troubleshooting.

**Credenciales centralizadas**: a diferencia de los otros MCPs propios, este
no carga el `.env` de la raíz por sí solo (no trae `dotenv`, lee directo de
`process.env` — así llegó de GP-DevOps y se dejó intacto para no crear una
divergencia difícil de rastrear si algún día se vuelve a sincronizar). Por
eso se registra vía
[`tools/launch-mcp-elk-observability.mjs`](tools/launch-mcp-elk-observability.mjs),
un wrapper que carga el `.env` de la raíz de `MCPs` antes de arrancar
`dist/main.js`. Registra este wrapper en tu config de MCP
(`.mcp.json`/`opencode.json`), no `dist/main.js` directo.

---

## 📄 Licencia

Software propio del equipo de QA Automation. Los MCPs incluidos en `tools/` son
desarrollos internos. Los de terceros (Engram, Context7, Excalidraw) conservan
sus respectivas licencias.