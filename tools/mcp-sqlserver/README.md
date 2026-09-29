# MCP SQL Server (vendored)

Servidor MCP local para consultar y operar **SQL Server** (base de datos `crt` y `prd`). Está versionado dentro de este repo para que todo el equipo lo use igual.

## Setup (una sola vez por máquina)

```bash
npm install
npm run build
```

Esto genera `dist/` (ignorado por git). El MCP se registra en `opencode.json` con ruta relativa: `node tools/mcp-sqlserver/dist/index.js`.

## Credenciales

**NO** se commitean. El server es **autocontenido**: carga las variables `SQLSERVER_*` desde un `.env` propio de **esta misma carpeta** (junto a `package.json`), por ruta explícita en `src/index.ts`. No depende del cwd ni de variables provistas por OpenCode. Copiá `.env.example` como `.env` acá mismo.

### Perfiles de conexión (`dev`, `drt` y `prd`)

El `.env` define **tres perfiles nombrados**, cada uno con sus propias credenciales completas:

```
# Perfil "dev" — desarrollo
SQLSERVER_DEV_SERVER=...
SQLSERVER_DEV_DATABASE=...
SQLSERVER_DEV_USER=tu_usuario_dev
SQLSERVER_DEV_PASSWORD=tu_password_dev
SQLSERVER_DEV_TIMEOUT=30

# Perfil "drt" — comprobación de recetas / CRT del ERP Perú 2
SQLSERVER_DRT_SERVER=localhost
SQLSERVER_DRT_DATABASE=crt
SQLSERVER_DRT_USER=tu_usuario_drt
SQLSERVER_DRT_PASSWORD=tu_password_drt
SQLSERVER_DRT_TIMEOUT=30

# Perfil "prd" — producción del ERP
SQLSERVER_PRD_SERVER=servidor-prd
SQLSERVER_PRD_DATABASE=prd
SQLSERVER_PRD_USER=tu_usuario_prd
SQLSERVER_PRD_PASSWORD=tu_password_prd
SQLSERVER_PRD_TIMEOUT=30
```

Cada tool recibe un parámetro `connection` (`"dev"` | `"drt"` | `"prd"`, default `"drt"`) para elegir el perfil. Los parámetros `server`/`database`/`user`/`password`/`timeout` siguen disponibles para sobreescribir puntualmente un campo del perfil elegido, sin tener que repetir todas las credenciales.

La lista de perfiles vive en un solo lugar — [src/connection-profiles.ts](src/connection-profiles.ts) — y `src/config/sql-config.ts` (que resuelve las variables de entorno a un `sql.config` por perfil) la importa de ahí. Agregar un cuarto perfil es cambiar esa lista una sola vez, no cada archivo por separado.

### ¿Por qué NO usar placeholders `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro (no admite comentarios) y OpenCode **no auto-carga** el `.env` de la raíz para resolver los placeholders de entorno (`env:VARIABLE`). Si la variable no está exportada en el entorno real del proceso, el placeholder se sustituye por una cadena vacía y el MCP arranca roto **silenciosamente** (el server lanza una excepción al validar credenciales). Por eso el server resuelve el `.env` raíz por ruta explícita y no confía en placeholders de `opencode.json`.

> La base de datos `crt` es la base de datos de comprobación de receptos (crt) del sistema ERP Perú 2.
> La base de datos `prd` es la base de datos de producción del sistema ERP.

## Uso

- `npm run dev` — ejecuta el servidor en modo desarrollo (`tsx`)
- `npm run build` — compila TypeScript a `dist/`
- `npm start` — ejecuta el servidor compilado

## Tools expuestas

- `sqlserver_query` — Ejecutar una consulta de **solo lectura** (SELECT/WITH)
- `sqlserver_get_schema` — Obtener esquema (tablas, vistas, procedimientos) de la base de datos
- `sqlserver_test_connection` — Probar la conexión a la base de datos
- `erp_fallas_resumen` — Monitoreo: resumen de excepciones (`SRExcepcion.dbo.log`) agrupado por módulo y nivel, últimos N días
- `erp_fallas_por_modulo` — Monitoreo: firmas de error dentro de un módulo (tipo + nivel + conteo), últimos N días
- `erp_falla_detalle` — Monitoreo: mensaje y traza completos de un `idlog` puntual
- `erp_anomalias` — Monitoreo: errores que se salieron de lo normal (nuevos o con un pico de volumen), no solo los más frecuentes
- `erp_fallas_rango` — Monitoreo: fallas dentro de un rango de fecha/hora explícito, opcionalmente filtrado por módulo

### Monitoreo de excepciones (`erp_fallas_resumen` / `erp_fallas_por_modulo`)

`SRExcepcion.dbo.log` tiene ~24 millones de filas y un solo índice: la PK clustered sobre `idlog`. **No hay índice en `fecha`**, así que cualquier filtro por fecha escanea la tabla completa — medido en `drt`: **~18 segundos** para un resumen de "último día".

Mientras no exista ese índice (pendiente de DBA — es DDL, este MCP no lo puede ni debe hacer), estas dos tools usan un atajo con lo que ya hay: `idlog` es `IDENTITY` y crece junto con `fecha` en una tabla append-only. Antes de aplicar el filtro de fecha real, acotan primero por un rango de `idlog` estimado (seek instantáneo sobre la PK, calibrado dinámicamente según el volumen reciente de logs, con margen de seguridad 3x). El filtro de `fecha` sigue siendo la condición de corrección — `idlog` solo poda el escaneo, nunca decide qué entra.

Medido: **17.8s → 0.4s** para el mismo resumen (últimos 1 día), verificado contra un full-scan sin atajo (mismo conteo de filas, sin pérdida).

Ninguna de las dos trae `mensaje`, `traza` ni `ubicacion` — son columnas `text` (LOB) y pesan mucho en tokens para una vista agregada. Para ver el detalle completo de una excepción puntual, usa `sqlserver_query` con el `idlog` exacto.

> Con el índice en `fecha` puesto, este atajo deja de ser necesario — pero no hace daño dejarlo, solo se vuelve redundante.

### `erp_anomalias` — "¿qué causó la caída?", no "¿qué pasa más seguido?"

El módulo con más errores en total casi nunca es el que causó un incidente puntual — suele ser ruido crónico (ej. un cliente reintentando con un token vencido, miles de veces al día, todos los días). Lo que sí indica un incidente real es algo que **normalmente no pasa** y de repente empezó a pasar.

`erp_anomalias` agrupa por `ubicacion` (el punto exacto del código que lanzó la excepción — mucho más específico que `tipo`, que suele ser un "Excepción Genérica" que mezcla causas distintas) y compara una ventana reciente contra el promedio de los días previos. Marca como anomalía lo que es nuevo (nunca había pasado) o lo que se disparó muy por encima de su tasa normal. El resultado trae `idlog_ejemplo` para pasarlo directo a `erp_falla_detalle`.

`nivel` (`DEBUG`/`INFO`/`WARN`/`ERROR`/`FATAL`) no sirve para esto — se verificó en `prd` que `FATAL` existe en el catálogo pero nunca se usa: todo entra como `ERROR` sin distinguir severidad real.

### Zona horaria (`useUTC: false`) — por qué está ahí y qué pasa si se quita

`fecha` es `datetime` en SQL Server: no tiene zona horaria, y sus valores están en hora **local del servidor** (UTC-5, confirmado con `SYSDATETIME()` vs `GETUTCDATE()`). Por default, `node-mssql`/`tedious` convierte los `Date` de JavaScript a UTC antes de enviarlos como parámetro — con esta máquina también en UTC-5, eso desfasaba cualquier filtro por hora exacta **5 horas hacia adelante**, en silencio (pedir "08:00–12:00" llegaba a SQL Server como "13:00–17:00"; verificado con conteos reales: 5,411 filas correctas vs. 5,104 con el bug, una ventana de tiempo distinta, no solo unas filas de más o de menos).

`options.useUTC: false` en `makeSqlConfig` (`src/config/sql-config.ts`) corrige esto — nunca lo quites sin volver a verificar contra una consulta con la fecha como texto literal en el SQL (no como parámetro), que es la única forma en que el bug se hizo visible la primera vez.

## Solo lectura (importante)

Este MCP lo usa el equipo de QA **contra producción**, por lo que **no expone ninguna ruta de escritura**. `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, DDL, `GRANT`/`REVOKE`, `EXEC` y `SELECT ... INTO` están bloqueados.

Se aplican tres capas independientes:

1. **Guard estático** (`src/read-only-guard.ts`) — allowlist: una sola sentencia, que debe empezar con `SELECT` o `WITH`. Neutraliza comentarios, literales de cadena e identificadores entre corchetes antes de analizar, así que ni se evade escondiendo una sentencia en un comentario ni da falsos positivos con `WHERE mensaje LIKE '%DELETE%'` o una columna llamada `[DELETE]`.
2. **Transacción con `ROLLBACK` garantizado** — la consulta corre dentro de una transacción que siempre se revierte, así nada persiste aunque la capa 1 fuera evadida. Usa `READ UNCOMMITTED` para no tomar bloqueos sobre las tablas de producción.
3. **Login de SQL Server de solo lectura** (infraestructura) — **la única garantía dura**. Las capas 1 y 2 son cinturón de seguridad; la cerradura real es que `SQLSERVER_PRD_USER` no tenga permisos de escritura en la base.

> Las capas 1 y 2 viven en el código y por lo tanto son modificables por cualquiera que edite el repo. **No sustituyen a la capa 3.** Configura el login de solo lectura.

Los tests del guard se ejecutan con:

```bash
npm test
```

## Variables de entorno (desde `.env` raíz)

Cada perfil (`DRT` o `PRD`) usa el mismo set de variables con su prefijo:

| Variable | Obligatoria | Descripción | Ejemplo |
|----------|:---:|-------------|---------|
| `SQLSERVER_<PERFIL>_SERVER` | ✅ | Host, IP o `HOST\INSTANCIA`. Sin comillas. | `SRVSQL-PRD` |
| `SQLSERVER_<PERFIL>_DATABASE` | ✅ | Base de datos por defecto de la conexión | `crt`, `prd` |
| `SQLSERVER_<PERFIL>_USER` | ✅ | Login de **autenticación SQL** (no usuario de Windows) | `qa_lectura` |
| `SQLSERVER_<PERFIL>_PASSWORD` | ✅ | Contraseña. Entre comillas simples si trae `#` o espacios. | `'mi#clave'` |
| `SQLSERVER_<PERFIL>_PORT` | — | Puerto. Omitir si es el estándar. Default `1433`. | `1433` |
| `SQLSERVER_<PERFIL>_TIMEOUT` | — | Segundos, aplica a conexión **y** a ejecución de la consulta. Default `30`. | `60` |
| `SQLSERVER_<PERFIL>_ENCRYPT` | — | `true` solo para Azure SQL. Default `false`. | `false` |

### Detalles que suelen fallar

- **Instancia nombrada**: va con backslash dentro de `SERVER` y **sin comillas** (`SRVSQL01\ERP`). Entre comillas dobles, dotenv interpreta el backslash como escape.
- **Puerto no estándar**: usa `PORT`. La sintaxis de SSMS `host,1433` **no funciona** con este driver, porque node-mssql recibe el puerto como campo aparte.
- **Autenticación de Windows**: no está soportada. Este MCP usa autenticación SQL; si el ERP solo acepta cuentas de dominio, hay que pedir un login SQL dedicado.
- **Consultar otra base del mismo servidor** (por ejemplo `SRExcepcion`): no hace falta otro perfil, basta calificar la tabla — `SELECT ... FROM SRExcepcion.dbo.LOG` — siempre que el login tenga permiso ahí.

## Streamable-http transport (Cognito + AVP)

Por default (`MCP_TRANSPORT=stdio`, o sin setear) este server se comporta
exactamente igual que antes: proceso local, stdin/stdout, sin red, sin auth.
Con `MCP_TRANSPORT=streamable-http` expone `POST` en el path que indique
`MCP_PUBLIC_URL` (bind en `MCP_HOST`/`MCP_PORT`) -- en este despliegue,
`https://mcp.gutierrezautomotriz.com/sqlserver/mcp`, detrás del mismo ALB
que ya expone [`../../../mcp-oauth-proxy`](../../../mcp-oauth-proxy) en la
raíz del dominio, enrutando `/sqlserver/*` al puerto local de este proceso
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

`erp2-npm` tiene un upstream configurado para resolver también paquetes
públicos, así que un `npm install`/`npm ci` normal resuelve todo (privado y
público) por ese mismo registry -- sin scopes, sin URLs de tarball a mano,
sin instalación en dos pasos. Solo hace falta un login vigente de
CodeArtifact antes de instalar (dura 12h):

```powershell
aws codeartifact login --tool npm --domain smartreasons --domain-owner 983698321034 --repository erp2-npm --region us-west-2
npm install
```
