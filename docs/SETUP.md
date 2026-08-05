# 📋 SETUP — Instalación paso a paso del MCP Stack

Guía detallada para poner en marcha los 5 MCPs del stack en una máquina nueva
(o en un proyecto nuevo). Al terminar tendrás un agente de OpenCode con
GitLab, BookStack, memoria persistente, documentación contextual y diagramas.

---

## 0. Requisitos previos

- **OpenCode** instalado (CLI).
- **Git** instalado.
- **Node.js 18+** (para mcp-bookstack).
- **Python 3.10+** y `pip` (para mcp-gitlab).
- **Engram CLI** instalado (para memoria persistente).

---

## 1. BookStack — MCP propio (Node/TS)

```bash
cd tools/mcp-bookstack
npm install
npm run build      # genera dist/ (NO versionado)
cd ../..
```

Crea el token en **BookStack > Settings > API Tokens**.

### Credenciales (en el `.env` de la raíz del proyecto)

```ini
BOOKSTACK_BASE_URL=https://tu-bookstack.example.com
BOOKSTACK_TOKEN_ID=tu_token_id_con_todos_sus_caracteres
BOOKSTACK_TOKEN_SECRET=tu_token_secret
```

> ⚠️ El `TOKEN_ID` debe llevar TODOS sus caracteres, incluido el `0` inicial
> si existe. Falta un carácter ⇒ el server lanza excepción al validar.

---

## 2. GitLab — MCP propio (Python)

```bash
pip install -r tools/mcp-gitlab/requirements.txt
```

Crea el token en **GitLab > Settings > Access Tokens**.

```ini
GITLAB_URL=https://tu-gitlab.example.com
GITLAB_TOKEN=tu_token_personal
```

| Scope | Permite |
|-------|---------|
| `read_api` | solo lectura |
| `api` | lectura + escritura (crear/aprobar MRs) |

> Estas variables se leen desde el `.env` de la **raíz del proyecto** por ruta
> explícita (no dependen del cwd ni de placeholders de OpenCode).

---

## 3. Engram — Memoria persistente (CLI)

Engram es una herramienta de terceros que aporta memoria entre sesiones.

```bash
# Instalar la CLI de Engram — guía oficial:
#   https://github.com/Gentleman-Programming/engram
# La config entra como servidor MCP local
engram mcp --tools=agent
```

En `opencode.json`:

```json
"engram": {
  "type": "local",
  "command": ["engram", "mcp", "--tools=agent"]
}
```

---

## 3.1 Gentle AI — Orquestador de skills (Opcional)

**Gentle AI** no es un MCP de este stack: es el **orquestador** que dota al agente
de **skills** y cohesiona los MCPs en un flujo de trabajo. Se instala por separado
y define el **cómo** se usan Engram, Context7, GitLab y BookStack (el **con qué**).

```bash
# Instalar Gentle AI — guía oficial:
#   https://github.com/Gentleman-Programming/gentle-ai
```

---

## 4. Context7 — Documentación remota (sin instalación)

MCP remoto, no requiere instalación local.

```json
"context7": {
  "type": "remote",
  "url": "https://mcp.context7.com/mcp",
  "enabled": true
}
```

---

## 5. Excalidraw — Diagramas (OPCIONAL, open-source)

Herramienta de terceros para diagramas editables. Se referencia, no se copia.

```json
"excalidraw": {
  "type": "local",
  "command": ["npx", "-y", "mcp-excalidraw-server"]
}
```

> Variante del `opencode.json` del propio proyecto para permitir exportar a una
> carpeta específica:
> ```json
> {
>   "type": "local",
>   "command": ["npx", "-y", "mcp-excalidraw-server", "--export-dir", "docs"]
> }
> ```

---

## 6. Variables de entorno — `.env` de la raíz

Copia el ejemplo y rellénalo con TUS credenciales:

```bash
cp .env.example .env
```

```ini
# BookStack
BOOKSTACK_BASE_URL=https://tu-bookstack.example.com
BOOKSTACK_TOKEN_ID=...
BOOKSTACK_TOKEN_SECRET=...

# GitLab
GITLAB_URL=https://tu-gitlab.example.com
GITLAB_TOKEN=...

# Excalidraw (opcional)
EXCALIDRAW_EXPORT_DIR=./docs
```

✋ **El `.env` NO se versiona** (está en `.gitignore`).

---

## 7. Configurar `opencode.json`

Fusiona el contenido de [`opencode.config.example.json`](../opencode.config.example.json)
en tu `opencode.json` real. Verás los MCPs `bookstack`, `gitlab`, `excalidraw`,
`engram` y `context7`.

Verificación:
- `engram mcp --tools=agent` debería devolver la lista de tools de memoria.
- Abre OpenCode y comprueba que aparezcan los MCPs en la paleta de herramientas.

---

## 8. Sanitizar antes de publicar

Si vas a hacer este repo **público** o compartirlo **fuera de tu organización**:

1. **Nunca** versiones el `.env`.
2. Busca URLs internas en todo el árbol: `grep -r "gitlab\..*\.com" . --include="*.md" --include="*.json" --include="*.ts" --include="*.py"`
3. Busca tokens reales: `grep -rE "glpat-|token_(id|secret)=[A-Za-z0-9]" .`
4. Si el repo ya tuvo un commit con datos sensibles, reescribe el historial
   (o mejor: cría un repo nuevo limpio y sube solo lo sanitizado).
5. En caso de duda, usa **repo privado**.

---

## 🔍 Referencias cruzadas

| Tema | Dónde |
|------|-------|
| Estructura del repo | `README.md` |
| Config de referencia | `opencode.config.example.json` |
| Primeros pasos rápidos | `README.md` → Quickstart |
| Errores típicos de token | secciones 1 y 2 de esta guía |