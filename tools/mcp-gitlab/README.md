# MCP GitLab (vendored)

Servidor MCP local para leer y operar **GitLab** (MRs, diffs, pipelines, archivos del
repositorio). Está versionado dentro de este repo para que todo el equipo lo use igual.

## Setup (una sola vez por máquina)

Requisito: **Python 3.10+** y `pip`.

```bash
cd tools/mcp-gitlab
pip install -r requirements.txt --extra-index-url https://pypi.org/simple/
```

> **Importante si ya usabas este MCP en stdio (Claude Code/OpenCode):**
> `server.py` ahora importa `mcp_cognito_avp` incondicionalmente (aunque
> corras en modo `stdio`, donde es un no-op), así que el intérprete de
> Python que `.mcp.json`/`opencode.config.json` invoquen (`command: python`,
> el de tu PATH salvo que lo hayas cambiado) necesita las dependencias
> nuevas instaladas ahí también, no solo en un venv aparte -- si no, el MCP
> deja de arrancar en stdio con `ModuleNotFoundError`.

## Credenciales

**NO** se commitean. El server es **autocontenido**: carga las variables
`GITLAB_*` desde un `.env` propio de **esta misma carpeta** (junto a
`server.py`), por ruta explícita (`load_dotenv(Path(__file__).resolve().parent / ".env")`).
No depende del cwd ni de variables provistas por OpenCode, así que funciona
igual desde la terminal, OpenCode o CI. Copiá `.env.example` como `.env`
acá mismo y completá:

```
GITLAB_URL=https://gitlab.sreasons.com
GITLAB_TOKEN=tu_token_personal
```

### ¿Por qué NO usar placeholders `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro (no admite comentarios) y OpenCode **no auto-carga**
ningún `.env` para resolver los placeholders de entorno (`env:VARIABLE`).
Si la variable no está exportada en el entorno real del proceso, el placeholder
se sustituye por una cadena vacía y el MCP arranca roto **silenciosamente**
(GitLab responde 401 o URL vacía). Por eso el server resuelve su propio
`.env` por ruta explícita y no confía en placeholders de `opencode.json`.

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

## Streamable-http transport (trusted-issuer + AVP)

Este server corre sobre `mcp.server.mcpserver.MCPServer` (SDK `mcp>=2.0.0` --
migrado desde `mcp.server.fastmcp.FastMCP`/`mcp[cli]>=1.2.0`; las 12 tools
no cambiaron, solo el import y la construcción del server). Por default
(`MCP_TRANSPORT=stdio`, o sin setear) se comporta exactamente igual que
antes: proceso local, stdin/stdout, sin red, sin auth.

Con `MCP_TRANSPORT=streamable-http` expone `POST` en el path que indique
`MCP_PUBLIC_URL` (bind en `MCP_HOST`/`MCP_PORT`) -- en este despliegue,
`https://mcp.gutierrezautomotriz.com/gitlab/mcp`, detrás del mismo ALB que
ya expone [`../../../mcp-oauth-proxy`](../../../mcp-oauth-proxy) en la raíz
del dominio, enrutando `/gitlab/*` al puerto local de este proceso (ver
[`../../deploy/PORTS.md`](../../deploy/PORTS.md)). El path se toma tal cual
de `MCP_PUBLIC_URL` (ver el bloque `streamable_http_path` en
`if __name__ == "__main__":`), así que ese valor debe coincidir exactamente
con la regla del ALB.

### Setup con auth (instalación)

```bash
cd tools/mcp-gitlab
python -m venv .venv
# Windows:
.venv\Scripts\pip install -r requirements.txt --extra-index-url https://pypi.org/simple/
```

`mcp` viene del índice público de PyPI; `mcp-cognito-avp` del CodeArtifact
privado de la org (`erp2-pip`), que es el `index-url` global ya configurado
en este tipo de máquinas -- por eso alcanza con agregar `--extra-index-url`
para el resto. Si el token de CodeArtifact expiró (error 401 al resolver
`mcp-cognito-avp`), refrescarlo con:

```bash
aws codeartifact login --tool pip --domain smartreasons --domain-owner 983698321034 --repository erp2-pip --region us-west-2
```

(el login dura 12 horas).
