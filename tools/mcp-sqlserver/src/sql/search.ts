import sql from "mssql";
import { SqlError, type SqlErrorCode } from "../utils/errors.js";

/** One `.input(name, type, value)` call to attach to a parameterized query. */
export interface SqlQueryInput {
  name: string;
  type: (() => sql.ISqlType) | sql.ISqlType;
  value: unknown;
}

/**
 * A single parameterized, read-only query. Building the SQL text this way
 * (never string interpolation) is what makes injection impossible — see
 * `sql/query-builder.ts`.
 */
export interface SqlQuerySpec {
  text: string;
  inputs?: SqlQueryInput[];
}

export interface SqlQueryResult<T = unknown> {
  recordset: T[];
}

/**
 * Equivalent to ELK's `SearchClientLike` — the seam domain code is written
 * against, so tests can inject a fake instead of a real `mssql` connection.
 *
 * - `query` runs one query inside its own read-only transaction.
 * - `queryMany` runs several queries inside a SINGLE shared read-only
 *   transaction (needed by `erp_fallas_rango`'s count + detail pair, which
 *   the original code intentionally grouped in one transaction).
 */
export interface SqlSearchClientLike {
  query<T = unknown>(spec: SqlQuerySpec): Promise<SqlQueryResult<T>>;
  queryMany<T = unknown>(specs: SqlQuerySpec[]): Promise<Array<SqlQueryResult<T>>>;
}

/**
 * Receives the TRANSACTION, not a `Request` already built — so a caller can
 * create as many `new sql.Request(transaction)` as it needs. Reusing one
 * `Request` across several `.query()` calls is not a guaranteed node-mssql
 * behavior. Always rolled back — this pool is never used to write.
 */
async function withReadOnlyTransaction<T>(
  pool: sql.ConnectionPool,
  run: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_UNCOMMITTED);
  try {
    return await run(transaction);
  } finally {
    await transaction.rollback().catch(() => {});
  }
}

function execSpec<T>(transaction: sql.Transaction, spec: SqlQuerySpec): Promise<SqlQueryResult<T>> {
  const request = new sql.Request(transaction);
  for (const input of spec.inputs ?? []) {
    request.input(input.name, input.type, input.value);
  }
  return request.query<T>(spec.text);
}

/**
 * Maps any error thrown by `mssql` to the typed `SqlError` taxonomy. The
 * original `.message` is always preserved unchanged (FR: response text must
 * stay identical) — only a `code` is added on top.
 */
export function mapSqlError(err: unknown): SqlError {
  if (err instanceof SqlError) return err;

  const message = err instanceof Error ? err.message : String(err);
  const mssqlCode = (err as { code?: string } | undefined)?.code;

  let code: SqlErrorCode = "SQL_QUERY_ERROR";
  if (mssqlCode === "ETIMEOUT") {
    code = "SQL_TIMEOUT";
  } else if (err instanceof sql.ConnectionError || err instanceof sql.TransactionError) {
    code = "SQL_CONNECTION_ERROR";
  } else if (err instanceof sql.RequestError) {
    code = "SQL_QUERY_ERROR";
  }

  return new SqlError(code, message, err);
}

/**
 * Builds a `SqlSearchClientLike` backed by a real, already-connected
 * `sql.ConnectionPool`. Any error thrown by the underlying `mssql` calls is
 * mapped through `mapSqlError` before it reaches domain code.
 */
export function createPoolSqlSearchClient(pool: sql.ConnectionPool): SqlSearchClientLike {
  return {
    async query<T>(spec: SqlQuerySpec) {
      try {
        return await withReadOnlyTransaction(pool, (transaction) => execSpec<T>(transaction, spec));
      } catch (err) {
        throw mapSqlError(err);
      }
    },
    async queryMany<T>(specs: SqlQuerySpec[]) {
      try {
        return await withReadOnlyTransaction(pool, async (transaction) => {
          const results: Array<SqlQueryResult<T>> = [];
          for (const spec of specs) {
            results.push(await execSpec<T>(transaction, spec));
          }
          return results;
        });
      } catch (err) {
        throw mapSqlError(err);
      }
    },
  };
}
