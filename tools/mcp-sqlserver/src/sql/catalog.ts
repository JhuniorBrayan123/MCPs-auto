/**
 * Builders SQL puros (sin `mssql`, sin red) para las tools de catálogo
 * multi-base: listar bases, esquema de una base y búsqueda de objetos entre
 * bases. Todo valor que viene del usuario viaja como parámetro (`@pattern`,
 * `@schema`, `@limit`, `@db`); lo único que se interpola en el texto SQL es el
 * nombre de una base, y SOLO después de validarlo contra `sys.databases`
 * (`resolveSearchDatabases`) y escaparlo con corchetes (`quoteDbName`).
 */

/** Bases de sistema que se excluyen por defecto. */
export const SYSTEM_DATABASES = ["master", "tempdb", "model", "msdb"] as const;

/** Tipos de `sys.objects` que cubre la búsqueda: tablas, vistas, procedimientos y funciones. */
export const SEARCHABLE_OBJECT_TYPES = ["U", "V", "P", "FN", "IF", "TF"] as const;

const SYSTEM_DB_LIST = SYSTEM_DATABASES.map((db) => `N'${db}'`).join(", ");
const OBJECT_TYPE_LIST = SEARCHABLE_OBJECT_TYPES.map((t) => `'${t}'`).join(", ");

export function isSystemDatabase(name: string): boolean {
  return (SYSTEM_DATABASES as readonly string[]).includes(name.toLowerCase());
}

/**
 * Escapa un nombre de base como identificador entre corchetes (`]` → `]]`).
 * Rechaza nombres vacíos o con caracteres de control/NUL, que no pueden venir
 * de `sys.databases` y solo indicarían un valor manipulado.
 */
export function quoteDbName(name: string): string {
  if (!name || name.length > 128 || /[\u0000-\u001f]/.test(name)) {
    throw new Error(`Nombre de base de datos inválido: ${JSON.stringify(name)}`);
  }
  return `[${name.replace(/]/g, "]]")}]`;
}

/**
 * Convierte el texto de búsqueda en un patrón LIKE `%texto%` literal:
 * `%`, `_`, `[` y `\` se escapan con `\` (se usa con `ESCAPE '\'`), de modo
 * que el usuario busca el texto tal cual, sin comodines accidentales.
 */
export function toLikeContainsPattern(text: string): string {
  return `%${text.replace(/[\\%_[]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * `schema: "*"` o `allSchemas: true` → sin filtro (null). Cualquier otro
 * valor filtra por ese esquema; por defecto `dbo` (comportamiento previo).
 */
export function resolveSchemaFilter(schema: string | undefined, allSchemas?: boolean): string | null {
  if (allSchemas) return null;
  const value = (schema ?? "dbo").trim();
  if (value === "" || value === "*") return null;
  return value;
}

/** Lista de bases con estado, recovery, compatibilidad, tamaño (si es visible) y acceso del login. */
export function buildListDatabasesSql(includeSystem: boolean): string {
  // `sys.master_files` solo es visible con VIEW ANY DEFINITION (o similar);
  // sin ese permiso el LEFT JOIN deja `size_mb` en NULL en vez de fallar.
  return `SELECT d.name,
       d.state_desc,
       d.recovery_model_desc,
       d.compatibility_level,
       CAST(ISNULL(HAS_DBACCESS(d.name), 0) AS bit) AS has_access,
       CAST(SUM(CAST(mf.size AS bigint)) * 8 / 1024.0 AS decimal(18, 2)) AS size_mb
FROM sys.databases d
LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
${includeSystem ? "" : `WHERE d.name NOT IN (${SYSTEM_DB_LIST})\n`}GROUP BY d.name, d.state_desc, d.recovery_model_desc, d.compatibility_level
ORDER BY d.name`;
}

/** Bases ONLINE a las que el login tiene acceso (incluye sistema; el filtrado se hace en JS). */
export const ACCESSIBLE_DATABASES_SQL = `SELECT name
FROM sys.databases
WHERE HAS_DBACCESS(name) = 1 AND state_desc = 'ONLINE'
ORDER BY name`;

export interface ResolvedDatabases {
  /** Nombres canónicos (tal como están en `sys.databases`) a consultar. */
  databases: string[];
  /** Nombres pedidos que no existen, no están ONLINE o no son accesibles. */
  rejected: string[];
}

/**
 * Decide qué bases consultar. Sin `requested`: todas las accesibles de
 * usuario (o también las de sistema si `includeSystem`). Con `requested`:
 * solo las que coinciden (sin distinguir mayúsculas) con una accesible — se
 * devuelve el nombre canónico de `sys.databases`, nunca el texto del usuario.
 */
export function resolveSearchDatabases(
  accessible: string[],
  requested?: string[],
  includeSystem = false
): ResolvedDatabases {
  if (!requested || requested.length === 0) {
    return {
      databases: accessible.filter((db) => includeSystem || !isSystemDatabase(db)),
      rejected: [],
    };
  }
  const byLower = new Map(accessible.map((db) => [db.toLowerCase(), db]));
  const databases: string[] = [];
  const rejected: string[] = [];
  for (const name of requested) {
    const canonical = byLower.get(name.trim().toLowerCase());
    if (canonical === undefined) {
      rejected.push(name);
    } else if (!databases.includes(canonical)) {
      databases.push(canonical);
    }
  }
  return { databases, rejected };
}

/**
 * Búsqueda por nombre de objeto (y opcionalmente de columna) dentro de UNA
 * base usando nombres de tres partes. Parámetros: `@db` (etiqueta del
 * resultado), `@pattern` (LIKE ya escapado) y `@limit`.
 */
export function buildSearchObjectsSql(database: string, includeColumns: boolean): string {
  const db = quoteDbName(database);
  const objects = `SELECT @db AS database_name, s.name AS schema_name, o.name AS object_name,
         o.type_desc AS object_type, CAST(NULL AS sysname) AS column_name
  FROM ${db}.sys.objects o
  JOIN ${db}.sys.schemas s ON s.schema_id = o.schema_id
  WHERE o.type IN (${OBJECT_TYPE_LIST}) AND o.is_ms_shipped = 0
    AND o.name LIKE @pattern ESCAPE '\\'`;
  const columns = `SELECT @db AS database_name, s.name AS schema_name, o.name AS object_name,
         o.type_desc AS object_type, c.name AS column_name
  FROM ${db}.sys.columns c
  JOIN ${db}.sys.objects o ON o.object_id = c.object_id
  JOIN ${db}.sys.schemas s ON s.schema_id = o.schema_id
  WHERE o.type IN ('U', 'V') AND o.is_ms_shipped = 0
    AND c.name LIKE @pattern ESCAPE '\\'`;
  return `SELECT TOP (@limit) r.*
FROM (
  ${objects}${includeColumns ? `\n  UNION ALL\n  ${columns}` : ""}
) r
ORDER BY r.schema_name, r.object_name, r.column_name`;
}

export interface SchemaObjectsSql {
  tables: string;
  views: string;
  procedures: string;
}

/** Consultas de `sqlserver_get_schema`; con `filtered` se espera el parámetro `@schema`. */
export function buildSchemaObjectsSql(filtered: boolean): SchemaObjectsSql {
  const infoFilter = filtered ? " AND TABLE_SCHEMA = @schema" : "";
  return {
    tables: `SELECT TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'${infoFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    views: `SELECT TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.VIEWS WHERE 1 = 1${infoFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    procedures: `SELECT s.name AS SCHEMA_NAME, o.name AS NAME, o.type_desc AS TYPE_DESC FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.type = 'P'${
      filtered ? " AND s.name = @schema" : ""
    } ORDER BY s.name, o.name`,
  };
}
