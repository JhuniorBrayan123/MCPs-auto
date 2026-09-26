# MCP SQL Server (vendored)

Servidor MCP local de **solo lectura** para **SQL Server**. Con **una sola credencial por servidor** accede a **todas las bases** que el login pueda ver (catálogo, búsqueda entre bases, consultas y tuning). Está versionado dentro de este repo para que todo el equipo lo use igual.

## Setup (una sola vez por máquina)

```bash
npm install
npm run build
```

Esto genera `dist/` (ignorado por git). El MCP se registra en `opencode.json` con ruta relativa: `node tools/mcp-sqlserver/dist/index.js`.

## Credenciales

**NO** se commitean. El server carga las variables `SQLSERVER_*` desde el `.env` de la **raíz del proyecto** como **única fuente**, por ruta explícita en `src/index.ts` (`new URL("../../../.env", import.meta.url)`, sube tres niveles desde `dist/` o `src/` hasta la raíz del repo). No depende del cwd ni de variables provistas por OpenCode. El `.env.example` de esta carpeta es solo documentación (no se copia como `.env` local).

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

Cada perfil representa **un servidor**, no una base: `SQLSERVER_<PERFIL>_DATABASE` es **opcional**. Si se deja vacío, la conexión entra a la base por defecto del login (normalmente `master`) y las tools pueden trabajar con cualquier base a la que el login tenga acceso (parámetro `database` o nombres de tres partes `Base.dbo.Tabla`).

Cada tool recibe un parámetro `connection` (`"dev"` | `"drt"` | `"prd"`, default `"drt"`) para elegir el perfil. Los parámetros `server`/`database`/`user`/`password`/`timeout` siguen disponibles para sobreescribir puntualmente un campo del perfil elegido, sin tener que repetir todas las credenciales.

La lista de perfiles vive en un solo lugar — [src/connection-profiles.ts](src/connection-profiles.ts) — e `index.ts` y `monitoring-tools.ts` la importan de ahí. Agregar un cuarto perfil es cambiar esa lista una sola vez, no cada archivo por separado.

### ¿Por qué NO usar placeholders `env:VARIABLE` en `opencode.json`?

`opencode.json` es JSON puro (no admite comentarios) y OpenCode **no auto-carga** el `.env` de la raíz para resolver los placeholders de entorno (`env:VARIABLE`). Si la variable no está exportada en el entorno real del proceso, el placeholder se sustituye por una cadena vacía y el MCP arranca roto **silenciosamente** (el server lanza una excepción al validar credenciales). Por eso el server resuelve el `.env` raíz por ruta explícita y no confía en placeholders de `opencode.json`.

> La base de datos `crt` es la base de datos de comprobación de receptos (crt) del sistema ERP Perú 2.
> La base de datos `prd` es la base de datos de producción del sistema ERP.

## Uso

- `npm run dev` — ejecuta el servidor en modo desarrollo (`tsx`)
- `npm run build` — compila TypeScript a `dist/`
- `npm start` — ejecuta el servidor compilado

## Tools expuestas

**Consultas y catálogo (todas las bases del login):**

- `sqlserver_query` — Ejecutar una consulta de **solo lectura** (SELECT/WITH). Otra base: parámetro `database` o nombres de tres partes (`Base.dbo.Tabla`)
- `sqlserver_get_schema` — Esquema (tablas, vistas, procedimientos) de **cualquier** base (`database`). `schema: "*"` o `allSchemas: true` lista todos los esquemas; default `dbo`
- `sqlserver_test_connection` — Probar la conexión (muestra la base realmente conectada, `DB_NAME()`)
- `sqlserver_list_databases` — Lista las bases del servidor: estado, recovery model, compatibilidad, tamaño y si el login tiene acceso (`includeSystem` para incluir master/tempdb/model/msdb)
- `sqlserver_search_objects` — Busca un texto en nombres de tablas, vistas, procedimientos y funciones (y columnas con `includeColumns`) en **todas** las bases accesibles u online, o en la lista `databases`. Las bases que fallen por permisos se reportan como omitidas sin abortar la búsqueda

**Tuning (solo lectura, DMVs — requieren `VIEW SERVER STATE`):**

- `sqlserver_tuning_missing_indexes` — Índices faltantes sugeridos por SQL Server, ordenados por impacto estimado, con el `CREATE INDEX` sugerido **solo como texto para el DBA** (nunca se ejecuta). Filtro opcional `database`, `limit` (default 25)
- `sqlserver_tuning_top_queries` — Consultas más costosas desde el caché de planes. `orderBy`: `cpu` \| `duration` \| `reads` \| `writes` \| `executions`; filtro `database`; `limit` (default 20, máx. 200)
- `sqlserver_tuning_index_usage` — Uso de índices de **una** base (`database` obligatorio): seeks/scans/lookups/updates y tamaño; `onlyUnused: true` muestra índices con escrituras pero sin lecturas (candidatos a revisar). Las estadísticas se reinician al reiniciar el servidor
- `sqlserver_tuning_blocking` — Requests en curso y bloqueos: sesión bloqueada/bloqueante, wait, tiempo, login, host y sentencia. `onlyBlocked`, `minElapsedMs`

Si al login le falta un permiso, la tool responde qué permiso debe otorgar el DBA en lugar de fallar con una traza.

**Monitoreo de excepciones:**

- `erp_fallas_resumen` — Monitoreo: resumen de excepciones (`SRExcepcion.dbo.log`) agrupado por módulo y nivel, últimos N días
- `erp_fallas_por_modulo` — Monitoreo: firmas de error dentro de un módulo (tipo + nivel + conteo), últimos N días
- `erp_falla_detalle` — Monitoreo: mensaje y traza completos de un `idlog` puntual
- `erp_anomalias` — Monitoreo: errores que se salieron de lo normal (nuevos o con un pico de volumen), no solo los más frecuentes

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

`options.useUTC: false` en `makeSqlConfig` (`src/index.ts`) corrige esto — nunca lo quites sin volver a verificar contra una consulta con la fecha como texto literal en el SQL (no como parámetro), que es la única forma en que el bug se hizo visible la primera vez.

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

## Permisos recomendados para el login (DBA)

El MCP solo ve lo que el login puede ver. Para que **una sola credencial** lea todas las bases del servidor sin poder modificar nada, el DBA puede otorgar (ejemplo, SQL Server 2014+):

```sql
USE master;
-- Lectura en todas las bases de usuario (incluidas las que se creen después)
GRANT CONNECT ANY DATABASE TO [qa_lectura];
GRANT SELECT ALL USER SECURABLES TO [qa_lectura];
-- Tools de tuning (DMVs de rendimiento: índices faltantes, top queries, bloqueos)
GRANT VIEW SERVER STATE TO [qa_lectura];
-- Ver definiciones de objetos y tamaños (sys.master_files) en todas las bases
GRANT VIEW ANY DEFINITION TO [qa_lectura];
```

Alternativa sin permisos de servidor: crear un usuario con `db_datareader` en cada base (hay que repetirlo por cada base nueva). La capa de solo lectura del propio MCP se mantiene igual, pero la garantía real es que el login sea de lectura.

## Variables de entorno (desde `.env` raíz)

Cada perfil (`DEV`, `DRT` o `PRD`) usa el mismo set de variables con su prefijo:

| Variable | Obligatoria | Descripción | Ejemplo |
|----------|:---:|-------------|---------|
| `SQLSERVER_<PERFIL>_SERVER` | ✅ | Host, IP o `HOST\INSTANCIA`. Sin comillas. | `SRVSQL-PRD` |
| `SQLSERVER_<PERFIL>_DATABASE` | — | Base por defecto de la conexión. Vacío = default del login (normalmente `master`); las tools igual acceden a las demás bases | `crt`, `prd` |
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