import { quoteDbName } from "./catalog.js";

/**
 * Builders SQL puros (sin `mssql`, sin red) para las tools de tuning. Todas
 * leen DMVs del servidor/base: son estrictamente de SOLO LECTURA y nunca
 * ejecutan DDL. Los valores del usuario viajan como parámetro (`@limit`,
 * `@dbid`, `@db`, `@minElapsedMs`); lo único que se interpola en el texto es:
 * - la columna de ORDER BY, tomada de un whitelist fijo (`TOP_QUERIES_ORDER_COLUMNS`), y
 * - el nombre de una base validado contra `sys.databases` y escapado con `quoteDbName`.
 */

/** Máximo de caracteres del texto de la sentencia en los resultados. */
export const STATEMENT_TEXT_MAX = 2000;

/** Recorta `value` al rango [1, max]; valores no numéricos usan `fallback`. */
export function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return Math.min(Math.max(1, Math.trunc(fallback)), max);
  return Math.min(Math.max(1, Math.trunc(n)), max);
}

/**
 * Busca `requested` (sin distinguir mayúsculas) en la lista de `sys.databases`
 * y devuelve la fila canónica, o null si no existe. El filtro por base de las
 * tools server-wide viaja luego como `@dbid` (entero), nunca como texto.
 */
export function resolveDatabaseByName<T extends { name: string }>(rows: T[], requested: string): T | null {
  const wanted = requested.trim().toLowerCase();
  if (!wanted) return null;
  return rows.find((row) => row.name.toLowerCase() === wanted) ?? null;
}

/** Todas las bases del servidor con su id (para filtrar DMVs server-wide por `database_id`). */
export const DATABASE_IDS_SQL = `SELECT name, database_id FROM sys.databases ORDER BY name`;

/** Texto de la sentencia individual dentro del batch, a partir de los offsets (en bytes, UTF-16). */
function statementTextExpr(alias: string, textExpr: string): string {
  return `LEFT(SUBSTRING(${textExpr}, ${alias}.statement_start_offset / 2 + 1,
         (CASE ${alias}.statement_end_offset WHEN -1 THEN DATALENGTH(${textExpr})
          ELSE ${alias}.statement_end_offset END - ${alias}.statement_start_offset) / 2 + 1), ${STATEMENT_TEXT_MAX})`;
}

// ---------------------------------------------------------------------------
// Índices faltantes
// ---------------------------------------------------------------------------

/**
 * Índices sugeridos por el optimizador (`sys.dm_db_missing_index_*`), ordenados
 * por "improvement measure" = avg_total_user_cost * avg_user_impact * (user_seeks + user_scans).
 * Con `filtered` se espera el parámetro `@dbid`.
 */
export function buildMissingIndexesSql(filtered: boolean): string {
  return `SELECT TOP (@limit)
       DB_NAME(mid.database_id) AS database_name,
       mid.statement AS table_name,
       mid.equality_columns,
       mid.inequality_columns,
       mid.included_columns,
       migs.user_seeks,
       migs.user_scans,
       CAST(migs.avg_total_user_cost AS decimal(18, 2)) AS avg_total_user_cost,
       CAST(migs.avg_user_impact AS decimal(5, 2)) AS avg_user_impact,
       CAST(migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS decimal(38, 2)) AS improvement_measure,
       migs.last_user_seek
FROM sys.dm_db_missing_index_group_stats migs
JOIN sys.dm_db_missing_index_groups mig ON mig.index_group_handle = migs.group_handle
JOIN sys.dm_db_missing_index_details mid ON mid.index_handle = mig.index_handle
${filtered ? "WHERE mid.database_id = @dbid\n" : ""}ORDER BY improvement_measure DESC`;
}

export interface MissingIndexColumns {
  table_name: string;
  equality_columns: string | null;
  inequality_columns: string | null;
  included_columns: string | null;
}

/** Última parte de un nombre `[db].[schema].[tabla]` sin corchetes. */
function lastIdentifierPart(qualified: string): string {
  const parts = qualified.match(/\[(?:[^\]]|\]\])*\]|[^.]+/g) ?? [qualified];
  const last = parts[parts.length - 1] ?? qualified;
  return last.replace(/^\[|\]$/g, "").replace(/\]\]/g, "]");
}

/** Deja solo letras, dígitos y `_` para armar el nombre sugerido del índice. */
function sanitizeForIndexName(text: string): string {
  return text.replace(/\[|\]/g, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Arma la sentencia CREATE INDEX sugerida, como TEXTO para que el DBA la
 * revise. Este MCP nunca la ejecuta (y el guard de solo lectura la bloquearía).
 */
export function buildCreateIndexSuggestion(row: MissingIndexColumns): string {
  const keyColumns = [row.equality_columns, row.inequality_columns]
    .filter((c): c is string => !!c && c.trim() !== "")
    .join(", ");
  const table = sanitizeForIndexName(lastIdentifierPart(row.table_name)) || "tabla";
  const firstKeys = sanitizeForIndexName(keyColumns.split(",").slice(0, 3).join("_")) || "cols";
  const indexName = `IX_${table}_${firstKeys}`.slice(0, 128);
  const include = row.included_columns && row.included_columns.trim() !== "" ? ` INCLUDE (${row.included_columns})` : "";
  return `-- SUGERENCIA para revisión del DBA (NO se ejecuta): validar contra índices existentes antes de crear\nCREATE NONCLUSTERED INDEX [${indexName}] ON ${row.table_name} (${keyColumns})${include};`;
}

// ---------------------------------------------------------------------------
// Top queries
// ---------------------------------------------------------------------------

export const TOP_QUERIES_ORDER_BY = ["cpu", "duration", "reads", "writes", "executions"] as const;
export type TopQueriesOrderBy = (typeof TOP_QUERIES_ORDER_BY)[number];

/** Whitelist fijo: la columna de ORDER BY NUNCA se interpola desde el input. */
export const TOP_QUERIES_ORDER_COLUMNS: Readonly<Record<TopQueriesOrderBy, string>> = Object.freeze({
  cpu: "qs.total_worker_time",
  duration: "qs.total_elapsed_time",
  reads: "qs.total_logical_reads",
  writes: "qs.total_logical_writes",
  executions: "qs.execution_count",
});

/** Columna de orden para `orderBy`; cualquier valor fuera del whitelist cae en `cpu`. */
export function resolveTopQueriesOrderColumn(orderBy: unknown): string {
  return Object.prototype.hasOwnProperty.call(TOP_QUERIES_ORDER_COLUMNS, orderBy as string)
    ? TOP_QUERIES_ORDER_COLUMNS[orderBy as TopQueriesOrderBy]
    : TOP_QUERIES_ORDER_COLUMNS.cpu;
}

/**
 * Consultas más costosas del plan cache. La base sale del `dbid` del texto
 * SQL o, si es NULL (ad hoc / preparadas), del atributo `dbid` del plan.
 * Con `filtered` se espera `@dbid`.
 */
export function buildTopQueriesSql(orderBy: TopQueriesOrderBy, filtered: boolean): string {
  const orderColumn = resolveTopQueriesOrderColumn(orderBy);
  return `SELECT TOP (@limit)
       DB_NAME(q.dbid) AS database_name,
       q.execution_count,
       CAST(q.total_worker_time / 1000.0 AS decimal(18, 2)) AS total_cpu_ms,
       CAST(q.total_worker_time / 1000.0 / q.execution_count AS decimal(18, 2)) AS avg_cpu_ms,
       CAST(q.total_elapsed_time / 1000.0 AS decimal(18, 2)) AS total_elapsed_ms,
       CAST(q.total_elapsed_time / 1000.0 / q.execution_count AS decimal(18, 2)) AS avg_elapsed_ms,
       q.total_logical_reads,
       q.total_logical_reads / q.execution_count AS avg_logical_reads,
       q.total_logical_writes,
       q.last_execution_time,
       q.statement_text
FROM (
  SELECT COALESCE(st.dbid, CONVERT(int, pa.value)) AS dbid,
         qs.execution_count, qs.total_worker_time, qs.total_elapsed_time,
         qs.total_logical_reads, qs.total_logical_writes, qs.last_execution_time,
         ${orderColumn} AS order_value,
         ${statementTextExpr("qs", "st.text")} AS statement_text
  FROM sys.dm_exec_query_stats qs
  CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
  OUTER APPLY (SELECT value FROM sys.dm_exec_plan_attributes(qs.plan_handle) WHERE attribute = 'dbid') pa
) q
WHERE q.execution_count > 0${filtered ? " AND q.dbid = @dbid" : ""}
ORDER BY q.order_value DESC`;
}

// ---------------------------------------------------------------------------
// Uso de índices (una base)
// ---------------------------------------------------------------------------

/**
 * Uso de índices de UNA base: `sys.dm_db_index_usage_stats` (server-wide,
 * filtrado por `DB_ID(@db)`) + catálogo y tamaño de la base con nombres de
 * tres partes. "Sin uso" = sin lecturas (seeks/scans/lookups) pero con
 * escrituras; se excluyen PK y restricciones UNIQUE de esa marca.
 * Parámetros: `@db` (nombre canónico) y `@limit`.
 */
export function buildIndexUsageSql(database: string, onlyUnused: boolean): string {
  const db = quoteDbName(database);
  const reads = "ISNULL(us.user_seeks, 0) + ISNULL(us.user_scans, 0) + ISNULL(us.user_lookups, 0)";
  const unused = `(${reads} = 0 AND ISNULL(us.user_updates, 0) > 0 AND i.is_primary_key = 0 AND i.is_unique_constraint = 0)`;
  return `SELECT TOP (@limit)
       @db AS database_name,
       s.name AS schema_name,
       o.name AS table_name,
       i.name AS index_name,
       i.type_desc AS index_type,
       i.is_primary_key,
       i.is_unique,
       ISNULL(us.user_seeks, 0) AS user_seeks,
       ISNULL(us.user_scans, 0) AS user_scans,
       ISNULL(us.user_lookups, 0) AS user_lookups,
       ISNULL(us.user_updates, 0) AS user_updates,
       us.last_user_seek,
       us.last_user_scan,
       us.last_user_update,
       CAST(CASE WHEN ${unused} THEN 1 ELSE 0 END AS bit) AS sin_uso,
       ps.row_count,
       CAST(ps.used_pages * 8 / 1024.0 AS decimal(18, 2)) AS size_mb
FROM ${db}.sys.indexes i
JOIN ${db}.sys.objects o ON o.object_id = i.object_id
JOIN ${db}.sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.dm_db_index_usage_stats us
  ON us.database_id = DB_ID(@db) AND us.object_id = i.object_id AND us.index_id = i.index_id
OUTER APPLY (
  SELECT SUM(p.row_count) AS row_count, SUM(p.used_page_count) AS used_pages
  FROM ${db}.sys.dm_db_partition_stats p
  WHERE p.object_id = i.object_id AND p.index_id = i.index_id
) ps
WHERE o.type = 'U' AND o.is_ms_shipped = 0 AND i.index_id > 0
${onlyUnused ? `  AND ${unused}\n` : ""}ORDER BY sin_uso DESC, ISNULL(us.user_updates, 0) DESC, s.name, o.name, i.name`;
}

/** Arranque de la instancia: las estadísticas de uso se reinician ahí. */
export const SERVER_START_TIME_SQL = `SELECT sqlserver_start_time FROM sys.dm_os_sys_info`;

// ---------------------------------------------------------------------------
// Bloqueos / requests largos
// ---------------------------------------------------------------------------

/**
 * Requests activos de usuario (excluye la propia sesión del MCP, `@@SPID`).
 * Parámetros: `@limit` y `@minElapsedMs`.
 */
export function buildBlockingSql(onlyBlocked: boolean): string {
  return `SELECT TOP (@limit)
       r.session_id,
       r.blocking_session_id,
       CAST(CASE WHEN EXISTS (SELECT 1 FROM sys.dm_exec_requests r2 WHERE r2.blocking_session_id = r.session_id)
            THEN 1 ELSE 0 END AS bit) AS is_blocker,
       DB_NAME(r.database_id) AS database_name,
       r.status,
       r.command,
       r.wait_type,
       r.wait_time AS wait_time_ms,
       r.total_elapsed_time AS elapsed_ms,
       r.cpu_time AS cpu_ms,
       r.logical_reads,
       s.login_name,
       s.host_name,
       s.program_name,
       ${statementTextExpr("r", "st.text")} AS statement_text
FROM sys.dm_exec_requests r
JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE r.session_id <> @@SPID
  AND s.is_user_process = 1
  AND r.total_elapsed_time >= @minElapsedMs
${onlyBlocked ? "  AND r.blocking_session_id <> 0\n" : ""}ORDER BY r.blocking_session_id DESC, r.total_elapsed_time DESC`;
}

/**
 * Sesiones que bloquean a otras pero no tienen request activo (típico: una
 * transacción abierta y la conexión inactiva). No aparecen en `dm_exec_requests`.
 */
export const IDLE_BLOCKERS_SQL = `SELECT s.session_id,
       s.status,
       DB_NAME(s.database_id) AS database_name,
       s.open_transaction_count,
       s.last_request_end_time,
       s.login_name,
       s.host_name,
       s.program_name
FROM sys.dm_exec_sessions s
WHERE s.session_id <> @@SPID
  AND s.session_id IN (SELECT r.blocking_session_id FROM sys.dm_exec_requests r WHERE r.blocking_session_id <> 0)
  AND NOT EXISTS (SELECT 1 FROM sys.dm_exec_requests r WHERE r.session_id = s.session_id)`;

// ---------------------------------------------------------------------------
// Errores de permisos
// ---------------------------------------------------------------------------

/** Números de error de SQL Server que indican falta de permisos. */
export const PERMISSION_ERROR_NUMBERS: readonly number[] = [229, 262, 297, 300];

function errorNumber(err: unknown): number | undefined {
  const candidates = [err, (err as { originalError?: unknown } | undefined)?.originalError];
  for (const candidate of candidates) {
    const direct = (candidate as { number?: unknown } | undefined)?.number;
    if (typeof direct === "number") return direct;
    const nested = (candidate as { originalError?: { info?: { number?: unknown } } } | undefined)?.originalError?.info
      ?.number;
    if (typeof nested === "number") return nested;
  }
  return undefined;
}

/** true si el error es de permisos (por número o por el texto del mensaje). */
export function isPermissionError(err: unknown): boolean {
  const number = errorNumber(err);
  if (number !== undefined && PERMISSION_ERROR_NUMBERS.includes(number)) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /VIEW (SERVER|DATABASE)( PERFORMANCE)? STATE|permission|permiso/i.test(message);
}

/**
 * Si `err` es de permisos, devuelve un mensaje claro en español indicando qué
 * debe otorgar el DBA; si no, null (el llamador muestra el error normal).
 */
export function permissionErrorMessage(err: unknown, requiredPermission: string): string | null {
  if (!isPermissionError(err)) return null;
  const original = err instanceof Error ? err.message : String(err);
  return `🔒 Permiso insuficiente: el login necesita ${requiredPermission}. Pide al DBA que lo otorgue (ver "Permisos recomendados para el login" en el README de mcp-sqlserver). Detalle de SQL Server: ${original}`;
}
