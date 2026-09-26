import sql from "mssql";
import type { SqlSearchClientLike } from "../sql/search.js";
import {
  ACCESSIBLE_DATABASES_SQL,
  buildListDatabasesSql,
  buildSearchObjectsSql,
  resolveSearchDatabases,
  toLikeContainsPattern,
} from "../sql/catalog.js";

export interface DatabaseInfo {
  name: string;
  state_desc: string;
  recovery_model_desc: string;
  compatibility_level: number;
  has_access: boolean;
  size_mb: number | null;
}

export async function listDatabases(client: SqlSearchClientLike, includeSystem: boolean): Promise<DatabaseInfo[]> {
  const { recordset } = await client.query<DatabaseInfo>({ text: buildListDatabasesSql(includeSystem) });
  return recordset;
}

export interface ObjectMatch {
  database_name: string;
  schema_name: string;
  object_name: string;
  object_type: string;
  column_name: string | null;
}

export interface SearchObjectsParams {
  text: string;
  databases?: string[];
  includeColumns: boolean;
  includeSystem: boolean;
  limit: number;
}

export interface SearchObjectsResult {
  matches: ObjectMatch[];
  searched: string[];
  /** Bases que fallaron al consultarse (permisos, base en recuperación, etc.). */
  skipped: Array<{ database: string; reason: string }>;
  /** Bases pedidas que no son accesibles/ONLINE en `sys.databases`. */
  rejected: string[];
  /** true si se alcanzó `limit` y la búsqueda se cortó. */
  truncated: boolean;
}

/**
 * Busca `text` en nombres de objetos (y columnas) de cada base accesible, de a
 * una base por consulta. Un fallo en una base no aborta la búsqueda: se anota
 * en `skipped` y se sigue con la siguiente.
 */
export async function searchObjects(
  client: SqlSearchClientLike,
  params: SearchObjectsParams
): Promise<SearchObjectsResult> {
  const { recordset } = await client.query<{ name: string }>({ text: ACCESSIBLE_DATABASES_SQL });
  const { databases, rejected } = resolveSearchDatabases(
    recordset.map((row) => row.name),
    params.databases,
    params.includeSystem
  );

  const pattern = toLikeContainsPattern(params.text);
  const result: SearchObjectsResult = { matches: [], searched: [], skipped: [], rejected, truncated: false };

  for (const database of databases) {
    const remaining = params.limit - result.matches.length;
    if (remaining <= 0) {
      result.truncated = true;
      break;
    }
    try {
      const { recordset: rows } = await client.query<ObjectMatch>({
        text: buildSearchObjectsSql(database, params.includeColumns),
        inputs: [
          { name: "db", type: sql.NVarChar(128), value: database },
          { name: "pattern", type: sql.NVarChar(4000), value: pattern },
          { name: "limit", type: sql.Int, value: remaining },
        ],
      });
      result.searched.push(database);
      result.matches.push(...rows);
      if (rows.length >= remaining) result.truncated = true;
    } catch (err) {
      result.skipped.push({ database, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
