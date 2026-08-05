# 🧩 MCP Stack — Suite de servidores MCP para QA Automation

Stack de **servidores MCP (Model Context Protocol)** que potencia a los agentes de
IA dentro de **OpenCode**. Es la receta reproducible para que cualquier proyecto
(incluido el de QA automática/ERP) tenga conectados GitLab, BookStack, Engram,
Context7 y Excalidraw en minutos.

> **Privacidad**: este repo es una **plantilla**. No contiene credenciales ni
> URLs internas de ninguna organización. Cada quien rellena su propio `.env`.

---

## 📚 ¿Qué hay en este stack?

| # | MCP | Tipo | ¿Qué hace? | Setup |
|---|-----|------|------------|-------|
| 1 | **BookStack** | 🧑‍💻 Propio (Node/TS) | Consultar y documentar en BookStack (wiki del agente QA) | `cd tools/mcp-bookstack && npm install && npm run build` |
| 2 | **GitLab** | 🧑‍💻 Propio (Python) | Leer/operar GitLab: MRs, diffs, pipelines, archivos | `pip install -r tools/mcp-gitlab/requirements.txt` |
| 3 | **Engram** | 🛠️ CLI instalada | Memoria persistente entre sesiones | [guía de instalación](https://github.com/Gentleman-Programming/engram) + `engram mcp` |
| 4 | **Context7** | ☁️ Remoto | Documentación actualizada de librerías/frameworks | ninguno (URL remota) |
| 5 | **Excalidraw** | 📦 open-source | Diagramas editables en canvas | `npx mcp-excalidraw-server` (opcional) |

**Dos son código propio** (`tools/`) y **tres son herramientas de terceros** que solo
se configuran. Este repo los une en una sola receta.

---

## 🚀 Quickstart

```bash
# 1. Copia este repo a la raíz de tu proyecto (o referencia la carpeta tools/)
# 2. Crea tu .env a partir del ejemplo
cp .env.example .env
# 3. Llena .env con TUS credenciales
# 4. Instala dependencias de BookStack
cd tools/mcp-bookstack && npm install && npm run build && cd ../..
# 5. Instala dependencias de GitLab
pip install -r tools/mcp-gitlab/requirements.txt
# 6. Fusiona opencode.config.example.json en tu opencode.json
```

> 📋 Guía paso a paso completa en [`docs/SETUP.md`](docs/SETUP.md).

---

## 🏗️ Arquitectura

```
proyecto/
├── .env                      ← ÚNICA fuente de credenciales (NO versionado)
├── opencode.json             ← registra los MCPs
├── tools/
│   ├── mcp-bookstack/        ← código propio (Node/TS)
│   └── mcp-gitlab/           ← código propio (Python)
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
- **Gentle AI** — tooling que integra estos MCPs con los agentes; ver su [guía de instalación](https://github.com/Gentleman-Programming/gentle-ai).
- **Context7** — MCP remoto `https://mcp.context7.com/mcp`; sin instalación local.
- **Excalidraw** — paquete npm open-source `mcp-excalidraw-server`; opcional, para
  diagramas editables; se instala con `npx` (no se copia en `tools/`).

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

---

## 📄 Licencia

Software propio del equipo de QA Automation. Los MCPs incluidos en `tools/` son
desarrollos internos. Los de terceros (Engram, Context7, Excalidraw) conservan
sus respectivas licencias.