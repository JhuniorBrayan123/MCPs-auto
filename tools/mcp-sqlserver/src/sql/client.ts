import sql from "mssql";

/**
 * Factory around `new sql.ConnectionPool(config)`, mirroring
 * `mcp-elk-observability/src/elastic/client.ts`'s `ClientFactory` pattern —
 * injectable so tests can substitute a fake pool without touching real
 * network/SQL Server state.
 */
export type SqlPoolFactory = (config: sql.config) => sql.ConnectionPool;

const defaultSqlPoolFactory: SqlPoolFactory = (config) => new sql.ConnectionPool(config);

/**
 * Constructs (but does not `.connect()`) the `mssql` connection pool from a
 * resolved `sql.config`. Connecting/closing stays the caller's
 * responsibility (see `tools/shared.ts::withSqlSearchClient`), same as the
 * original inline `new sql.ConnectionPool(makeSqlConfig(connection))`.
 */
export function createSqlPool(
  config: sql.config,
  poolFactory: SqlPoolFactory = defaultSqlPoolFactory
): sql.ConnectionPool {
  return poolFactory(config);
}
