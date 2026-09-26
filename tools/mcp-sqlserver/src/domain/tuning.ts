import sql from "mssql";
import type { SqlSearchClientLike } from "../sql/search.js";
import { ACCESSIBLE_DATABASES_SQL, resolveSearchDatabases } from "../sql/catalog.js";
import {
  DATABASE_IDS_SQL,
  IDLE_BLOCKERS_SQL,
  SERVER_START_TIME_SQL,
  buildBlockingSql,
  buildCreateIndexSuggestion,
  buildIndexUsageSql,
  buildMissingIndexesSql,
  buildTopQueriesSql,
  resolveDatabaseByName,
  type TopQueriesOrderBy,
} from "../sql/tuning.js";

/**
 * Lógica de las tools de tuning contra el cliente inyectable. Todo es lectura
 * de DMVs; las sentencias CREATE INDEX que se devuelven son solo texto.
 */

/**
 * Filtro opcional por base de las tools server-wide: valida el nombre contra
 * `sys.databases` y devuelve su `database_id` (o null sin filtro).
 */
async function resolveDatabaseId(
  client: SqlSearchClientLike,
  database: string | undefined
): Promise<{ id: number; name: string } | null> {
  if (database === undefined || database.trim() === "") return null;
  const { recordset } = await client.query<{ name: string; database_id: number }>({ text: DATABASE_IDS_SQL });
  const row = resolveDatabaseByName(recordset, database);
  if (!row) {
    throw new Error(`La base "${database}" no existe en el servidor. Usa sqlserver_list_databases para ver las disponibles.`);
  }
  return { id: row.database_id, name: row.name };
}

function filterInputs(limit: number, db: { id: number } | null) {
  const inputs = [{ name: "limit", type: sql.Int, value: limit }];
  if (db) inputs.push({ name: "dbid", type: sql.Int, value: db.id });
  return inputs;
}

export interface MissingIndexRow {
  database_name: string;
  table_name: string;
  equality_columns: string | null;
  inequality_columns: string | null;
  included_columns: string | null;
  user_seeks: number;
  user_scans: number;
  avg_total_user_cost: number;
  avg_user_impact: number;
  improvement_measure: number;
  last_user_seek: Date | null;
  /** Sentencia sugerida para el DBA. Solo texto: nunca se ejecuta. */
  create_index_sugerido: string;
}

export async function getMissingIndexes(
  client: SqlSearchClientLike,
  params: { database?: string; limit: number }
): Promise<{ database: string | null; rows: MissingIndexRow[] }> {
  const db = await resolveDatabaseId(client, params.database);
  const { recordset } = await client.query<Omit<MissingIndexRow, "create_index_sugerido">>({
    text: buildMissingIndexesSql(db !== null),
    inputs: filterInputs(params.limit, db),
  });
  return {
    database: db?.name ?? null,
    rows: recordset.map((row) => ({ ...row, create_index_sugerido: buildCreateIndexSuggestion(row) })),
  };
}

export interface TopQueryRow {
  database_name: string | null;
  execution_count: number;
  total_cpu_ms: number;
  avg_cpu_ms: number;
  total_elapsed_ms: number;
  avg_elapsed_ms: number;
  total_logical_reads: number;
  avg_logical_reads: number;
  total_logical_writes: number;
  last_execution_time: Date;
  statement_text: string;
}

export async function getTopQueries(
  client: SqlSearchClientLike,
  params: { database?: string; orderBy: TopQueriesOrderBy; limit: number }
): Promise<{ database: string | null; rows: TopQueryRow[] }> {
  const db = await resolveDatabaseId(client, params.database);
  const { recordset } = await client.query<TopQueryRow>({
    text: buildTopQueriesSql(params.orderBy, db !== null),
    inputs: filterInputs(params.limit, db),
  });
  return { database: db?.name ?? null, rows: recordset };
}

export interface IndexUsageRow {
  database_name: string;
  schema_name: string;
  table_name: string;
  index_name: string;
  index_type: string;
  is_primary_key: boolean;
  is_unique: boolean;
  user_seeks: number;
  user_scans: number;
  user_lookups: number;
  user_updates: number;
  last_user_seek: Date | null;
  last_user_scan: Date | null;
  last_user_update: Date | null;
  sin_uso: boolean;
  row_count: number | null;
  size_mb: number | null;
}

export async function getIndexUsage(
  client: SqlSearchClientLike,
  params: { database: string; onlyUnused: boolean; limit: number }
): Promise<{ database: string; serverStartTime: Date | null; rows: IndexUsageRow[] }> {
  const { recordset: accessible } = await client.query<{ name: string }>({ text: ACCESSIBLE_DATABASES_SQL });
  const { databases } = resolveSearchDatabases(
    accessible.map((row) => row.name),
    [params.database],
    true
  );
  const database = databases[0];
  if (database === undefined) {
    throw new Error(
      `La base "${params.database}" no existe, no está ONLINE o el login no tiene acceso. Usa sqlserver_list_databases.`
    );
  }

  const { recordset: rows } = await client.query<IndexUsageRow>({
    text: buildIndexUsageSql(database, params.onlyUnused),
    inputs: [
      { name: "db", type: sql.NVarChar(128), value: database },
      { name: "limit", type: sql.Int, value: params.limit },
    ],
  });
  const { recordset: start } = await client.query<{ sqlserver_start_time: Date }>({ text: SERVER_START_TIME_SQL });
  return { database, serverStartTime: start[0]?.sqlserver_start_time ?? null, rows };
}

export interface BlockingRow {
  session_id: number;
  blocking_session_id: number;
  is_blocker: boolean;
  database_name: string | null;
  status: string;
  command: string;
  wait_type: string | null;
  wait_time_ms: number;
  elapsed_ms: number;
  cpu_ms: number;
  logical_reads: number;
  login_name: string;
  host_name: string | null;
  program_name: string | null;
  statement_text: string | null;
}

export interface IdleBlockerRow {
  session_id: number;
  status: string;
  database_name: string | null;
  open_transaction_count: number;
  last_request_end_time: Date | null;
  login_name: string;
  host_name: string | null;
  program_name: string | null;
}

export async function getBlocking(
  client: SqlSearchClientLike,
  params: { onlyBlocked: boolean; minElapsedMs: number; limit: number }
): Promise<{ requests: BlockingRow[]; idleBlockers: IdleBlockerRow[] }> {
  const { recordset: requests } = await client.query<BlockingRow>({
    text: buildBlockingSql(params.onlyBlocked),
    inputs: [
      { name: "limit", type: sql.Int, value: params.limit },
      { name: "minElapsedMs", type: sql.Int, value: params.minElapsedMs },
    ],
  });
  const { recordset: idleBlockers } = await client.query<IdleBlockerRow>({ text: IDLE_BLOCKERS_SQL });
  return { requests, idleBlockers };
}
