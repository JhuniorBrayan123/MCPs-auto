<details>
<summary>🛠️ 9. Instalación de herramientas del ecosistema (Warp, Git, Node, Go, OpenCode, Gentle-AI, Engram)</summary>

# 20. Manual de instalación del ecosistema QA con IA

Manual de instalación de las herramientas que usa el equipo de QA con IA.
Plataforma objetivo: **Windows 10/11** — Terminal: **Warp con PowerShell**.
El proceso se divide en 10 pasos. Los comandos publicados son **solo de Windows**.

## 20.1 Prerrequisitos

Antes de empezar, verificar:

- Sistema operativo **Windows 10 versión 1903 o superior** (o Windows 11).
- Conexión a internet estable.
- Cuenta de usuario con permisos de instalación.
- **Warp** instalado (se instala en el paso 2) para ejecutar los comandos.

> Nota: los pasos 2 a 8 siguen un orden fijo. No saltar pasos; cada herramienta
> es prerrequisito de la siguiente.

## 20.2 Warp

### Objetivo

Instalar la terminal moderna que usará el equipo para todos los comandos.

### Prerrequisitos

- Windows 10 versión 1903 o posterior.

### Instalación

```powershell
winget install --id Warp.Warp -e
```

También puede instalarse desde el ejecutable oficial de Warp.

### Validación

```powershell
warp
```

Debe abrirse la ventana de Warp. También puede abrirse desde el menú Inicio.

### Configuración inicial

Abrir Warp, configurar el perfil PowerShell (5.1 o superior) y el esquema de
colores preferido.

### Error frecuente

Si `winget` no se reconoce: actualizar **App Installer** desde la Microsoft
Store o validar que Windows 10/11 tenga la versión reciente de `winget`.

### Evidencia requerida

Captura de la ventana de Warp abierta y ejecutando `winget --version`.

## 20.3 Git

### Objetivo

Instalar el sistema de control de versiones para clonar y mantener actualizado
el proyecto de automatización.

### Prerrequisitos

- Warp instalado.

### Instalación

```powershell
winget install --id Git.Git -e
```

Cerrar y volver a abrir Warp después de instalar.

### Validación

```powershell
git --version
```

Debe mostrarse una versión de Git sin errores.

### Configuración inicial

Opcional: configurar usuario global:

```powershell
git config --global user.name "Tu Nombre"
git config --global user.email "tu_correo@empresa.com"
```

### Error frecuente

Si `git` no se reconoce tras instalar: cerrar completamente Warp y volver a
abrirlo para refrescar el PATH.

### Evidencia requerida

Captura de `git --version`.

## 20.4 Node.js

### Objetivo

Instalar el runtime JavaScript necesario para el proyecto (Playwright, OpenCode)
y para los componentes administrados de Gentle-AI.

### Prerrequisitos

- Git instalado.
- Cerrar Warp antes de instalar.

### Instalación

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Cerrar y volver a abrir Warp después de instalar.

### Validación

```powershell
node --version
npm --version
npx --version
```

Las tres deben mostrar versión sin errores. Gentle-AI necesita **Node.js 18 o
superior**.

### Configuración inicial

Ninguna adicional: npm se instala junto con Node.js.

### Error frecuente

Si `node` no se reconoce: cerrar Warp por completo y reabrir. Después revisar:

```powershell
npm config get prefix
```

### Evidencia requerida

Captura de `node --version`, `npm --version` y `npx --version`.

## 20.5 Go

### Objetivo

Instalar el compilador de Go necesario para instalar Gentle-AI y Engram
(método `go install`).

### Prerrequisitos

- Windows 10/11.

### Instalación

Descargar el instalador oficial para Windows desde el sitio de Go:
`https://go.dev/dl/` y ejecutarlo (sigue el asistente con valores por defecto).

### Validación

```powershell
go version
go env GOPATH
```

Debe mostrarse una versión **1.25.10 o superior** (requisito actual de
Gentle-AI en Windows).

### Configuración inicial

Verificar que el directorio de binarios de Go esté en el PATH. Normalmente:

```powershell
C:\Users\NOMBRE_USUARIO\go\bin
```

### Error frecuente

Si `go` no se reconoce o `go install` falla al descargar: validar que la
carpeta `%USERPROFILE%\go\bin` esté en el PATH del sistema y reabrir Warp.

### Evidencia requerida

Captura de `go version` mostrando la versión instalada.

## 20.6 OpenCode

### Objetivo

Instalar el agente de programación con IA que utilizará el equipo desde Warp.

### Prerrequisitos

- Node.js y npm disponibles (paso 4).

### Instalación

```powershell
npm install -g opencode-ai
```

### Validación

```powershell
opencode --version
```

Debe mostrarse una versión sin errores.

### Configuración inicial

Ejecutar:

```powershell
opencode
```

Dentro de la interfaz usar `/connect` y seleccionar el proveedor/modelo
aprobado por el equipo. Después, en cada proyecto, usar `/init`.

### Error frecuente

Si aparece `'opencode' no se reconoce como un comando`: cerrar completamente
Warp y volver a abrirlo; después revisar:

```powershell
npm config get prefix
```

### Evidencia requerida

Captura de `opencode --version`.

## 20.7 Gentle-AI

### Objetivo

Instalar el orquestador de skills que cohesiona las herramientas y los MCPs
del ecosistema con el agente.

### Prerrequisitos

- Go 1.25.10 o superior (paso 5).
- OpenCode instalado (paso 6).

### Instalación

En PowerShell o Warp:

```powershell
go install github.com/gentleman-programming/gentle-ai/v2/cmd/gentle-ai@latest
```

> El método recomendado en Windows es `go install`. La distribución oficial
> mediante Scoop está temporalmente no disponible mientras se resuelve la firma
> Authenticode.

### Validación

```powershell
gentle-ai version
```

Debe mostrarse la versión instalada.

### Configuración inicial

Ejecutar el asistente:

```powershell
gentle-ai install
```

En el asistente seleccionar:

- **Agente:** OpenCode
- **Memoria:** Engram
- **Skills:** habilitados
- **Permisos:** habilitados
- **Scope:** según definición del equipo

Finalmente ejecutar:

```powershell
gentle-ai doctor
```

### Error frecuente

Si `gentle-ai` no se reconoce tras `go install`: validar que
`%USERPROFILE%\go\bin` esté en el PATH y reabrir Warp.

### Evidencia requerida

Captura de `gentle-ai version` y de `gentle-ai doctor` sin errores.

## 20.8 Engram

### Objetivo

Instalar la memoria persistente del agente (persiste decisiones y contexto
entre sesiones).

### Prerrequisitos

- Go instalado (paso 5).
- Gentle-AI instalado (paso 7).

### Instalación

Primero comprobar si Gentle-AI ya lo instaló:

```powershell
engram version
```

Si el comando no existe:

```powershell
go install github.com/Gentleman-Programming/engram/cmd/engram@latest
```

### Validación

```powershell
engram version
engram setup opencode
```

Ambos deben ejecutarse sin errores.

### Configuración inicial

`engram setup opencode` configura la integración con OpenCode automáticamente.
Revisar que el servidor MCP `engram` aparezca en la config de OpenCode.

### Error frecuente

Si `engram` no se reconoce: validar PATH (`%USERPROFILE%\go\bin`) y reabrir
Warp; si persiste, reinstalar con `go install`.

### Evidencia requerida

Captura de `engram version` y del resultado de `engram setup opencode`.

## 20.9 Validación integral

Ejecutar en orden y confirmar que todo responda:

```powershell
warp --version
git --version
node --version
npm --version
go version
opencode --version
gentle-ai version
engram version
```

Después abrir OpenCode (`opencode`) y verificar que:

- El proveedor/modelo responde en `/connect`.
- Los MCPs del proyecto aparecen cargados (BookStack, GitLab, Excalidraw en el
  proyecto; Engram y Context7 a nivel global).
- `gentle-ai doctor` reporta salud OK.

### Evidencia requerida

Captura de la salida completa de los comandos de validación.

## 20.10 Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `'git' no se reconoce` | PATH desactualizado | Cerrar y reabrir Warp |
| `'node' no se reconoce` | PATH desactualizado | Cerrar y reabrir Warp; revisar `npm config get prefix` |
| `'go' no se reconoce` | Go no agregó su bin al PATH | Verificar `%USERPROFILE%\go\bin` en PATH |
| `'gentle-ai' no se reconoce` | bin de Go no en PATH | Verificar PATH y reabrir Warp |
| `'engram' no se reconoce` | bin de Go no en PATH | Verificar PATH; reinstalar con `go install` |
| `go install` falla al descargar | Problema de red / proxy | Validar conexión; reintentar `go install` |
| OpenCode no conecta al proveedor | Credenciales o proveedor incorrectos | Revisar `/connect` y seleccionar el proveedor aprobado |
| `gentle-ai doctor` reporta fallo | Skill o MCP no configurado | Revisar el detalle del doctor y la instalación del paso 7 |

</details>
