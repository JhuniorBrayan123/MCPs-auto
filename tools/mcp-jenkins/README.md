# MCP Jenkins

Servidor MCP (Model Context Protocol) para Jenkins vía su REST API estándar
(`/api/json`, `crumbIssuer`, `wfapi`). Node/TypeScript, distribuido con el
SDK oficial `@modelcontextprotocol/sdk`.

Por defecto es **solo lectura**. Las dos únicas tools de escritura
(`jenkins_trigger_build`, `jenkins_stop_build`) están deshabilitadas hasta
que actives `JENKINS_ALLOW_WRITE=true`.

## Setup

```bash
cd tools/mcp-jenkins
npm install
npm run build
```

Copia las variables de [`.env.example`](.env.example) al `.env` de la
**raíz** del proyecto `MCPs` (no dentro de esta carpeta):

```bash
JENKINS_URL=http://localhost:8080
JENKINS_USER=tu_usuario
JENKINS_TOKEN=tu_api_token   # Jenkins > tu usuario > Configure > API Token
JENKINS_TIMEOUT_MS=30000
JENKINS_ALLOW_WRITE=false
JENKINS_INSECURE_TLS=false
```

Registro en `opencode.json` / `.mcp.json`:

```json
{
  "mcp": {
    "jenkins": {
      "type": "local",
      "command": ["node", "tools/mcp-jenkins/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Tipo | Descripción |
|---|---|---|
| `jenkins_test_connection` | lectura | Verifica credenciales/conexión, devuelve versión y modo |
| `jenkins_list_jobs` | lectura | Lista jobs; `recursive`/`maxDepth` para entrar a carpetas |
| `jenkins_get_job` | lectura | Detalle de un job: salud, parámetros, referencias a builds |
| `jenkins_get_build` | lectura | Detalle de un build: resultado, duración, causas, parámetros, SCM |
| `jenkins_get_console_log` | lectura | Log de consola (`tailLines`, default 200; 0 = completo) |
| `jenkins_get_build_changes` | lectura | Solo los commits/cambios de SCM de un build |
| `jenkins_get_pipeline_stages` | lectura | Stages de un Pipeline (requiere plugin `wfapi`) |
| `jenkins_get_queue` | lectura | Items en cola de build |
| `jenkins_get_nodes` | lectura | Estado de nodos/agentes y ejecutores |
| `jenkins_trigger_build` | **escritura** | Dispara un build, con o sin parámetros |
| `jenkins_stop_build` | **escritura** | Aborta un build en ejecución |

### Rutas de job con carpetas

Todas las tools que reciben `jobPath` aceptan la ruta tal como se ve en la UI
de Jenkins, separando carpetas con `/`:

```
mi-carpeta/subcarpeta/mi-job
```

Internamente se traduce a la ruta de la API de Jenkins
(`job/mi-carpeta/job/subcarpeta/job/mi-job`), que es como Jenkins expone
folders vía REST (plugin CloudBees Folders).

### Alias de build number

`buildNumber` acepta un número concreto o uno de estos alias que resuelve
Jenkins directamente: `lastBuild`, `lastSuccessfulBuild`, `lastFailedBuild`,
`lastCompletedBuild`, `lastStableBuild` (default: `lastBuild`).

## Seguridad

- Autenticación siempre con **API Token** (Basic Auth usuario+token), nunca
  con la contraseña real del usuario.
- CSRF crumb (`crumbIssuer`) se obtiene y adjunta automáticamente en las
  tools de escritura si la instancia de Jenkins lo requiere; si el crumb
  issuer está deshabilitado, se continúa sin él (no es un error fatal).
- `jenkins_trigger_build` y `jenkins_stop_build` están **deshabilitadas por
  defecto**: requieren `JENKINS_ALLOW_WRITE=true` explícito en el `.env`.
- `JENKINS_INSECURE_TLS=true` desactiva la validación de certificados TLS a
  nivel de proceso — solo para labs con certificados autofirmados sin CA de
  confianza; nunca actives esto contra un Jenkins expuesto a internet.

## Tests

```bash
npm test
```

Cubre `jobApiPath` (la traducción de rutas de carpeta a rutas de API), que
es la única lógica no trivial del cliente.
