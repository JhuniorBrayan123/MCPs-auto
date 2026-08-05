# MCP GitLab (vendored)

Servidor MCP local para leer y operar **GitLab** (MRs, diffs, pipelines, archivos del
repositorio). Está versionado dentro de este repo para que todo el equipo lo use igual.

## Setup (una sola vez por máquina)

Requisito: **Python 3.10+** y `pip`.

```bash
cd tools/mcp-gitlab
pip install -r requirements.txt
```

## Credenciales

**NO** se commitean. El server carga las variables `GITLAB_*` desde el `.env`
de la **raíz del proyecto** como **única fuente**, por ruta explícita
(`load_dotenv(Path(__file__).resolve().parents[2] / ".env")`): desde
`tools/mcp-gitlab/`, `parents[2]` es la raíz del repo. No depende del cwd ni de
variables provistas por OpenCode, así que funciona igual desde la terminal,
OpenCode o CI. El `.env.example` de esta carpeta es solo documentación (no se
usa en runtime):

```
GITLAB_URL=https://gitlab.sreasons.com
GITLAB_TOKEN=tu_token_personal
```

### ¿Por qué NO usar placeholders `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro (no admite comentarios) y OpenCode **no auto-carga**
el `.env` de la raíz para resolver los placeholders de entorno (`env:VARIABLE`).
Si la variable no está exportada en el entorno real del proceso, el placeholder
se sustituye por una cadena vacía y el MCP arranca roto **silenciosamente**
(GitLab responde 401 o URL vacía). Por eso el server resuelve el `.env` raíz por
ruta explícita y no confía en placeholders de `opencode.json`.

> El token se crea en **GitLab > Settings > Access Tokens**. Para operaciones de
> escritura (crear/aprobar MRs) requiere scope `api`; para solo lectura alcanza
> `read_api`.

## Uso

- `python server.py` — ejecuta el servidor en modo stdio (lo usa OpenCode)
- Verificación rápida: el MCP aparece en `opencode.json` como `gitlab`

## Tools expuestas

- `search_projects` / `get_repository_tree` / `get_file_content` (lectura)
- `list_merge_requests` / `get_merge_request` / `get_merge_request_diff`
- `get_merge_request_comments` / `get_merge_request_pipelines` / `get_conflicting_files`
- `create_merge_request` / `update_merge_request` / `approve_merge_request` (escritura, con guardas)
