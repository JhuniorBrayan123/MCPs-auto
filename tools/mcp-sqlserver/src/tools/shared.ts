import sql from "mssql";
import { createSqlPool, type SqlPoolFactory } from "../sql/client.js";
import { createPoolSqlSearchClient, type SqlSearchClientLike } from "../sql/search.js";
import type { ConnectionName } from "../connection-profiles.js";

/**
 * Runtime dependencies every `tools/erp_*.ts` module needs: how to resolve a
 * connection profile into a `sql.config`, plus an injectable pool factory
 * (mirrors `mcp-elk-observability/src/tools/shared.ts`'s `ToolDeps`, adapted
 * to SQL Server's per-call connection-pool lifecycle instead of one
 * long-lived Elasticsearch client).
 */
export interface MonitoringToolDeps {
  makeSqlConfig: (connection: ConnectionName) => sql.config;
  poolFactory?: SqlPoolFactory;
}

export type McpToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Opens a pool for `connection`, connects it, builds the injected
 * `SqlSearchClientLike` on top of it, runs `fn`, and always closes the pool
 * — exactly the open/connect/query/close lifecycle every tool used to
 * repeat inline.
 */
export async function withSqlSearchClient<T>(
  deps: MonitoringToolDeps,
  connection: ConnectionName,
  fn: (client: SqlSearchClientLike) => Promise<T>
): Promise<T> {
  const pool = createSqlPool(deps.makeSqlConfig(connection), deps.poolFactory);
  try {
    await pool.connect();
    const client = createPoolSqlSearchClient(pool);
    return await fn(client);
  } finally {
    try {
      await pool.close();
    } catch {
      // Same as the original: closing errors are swallowed, never surfaced.
    }
  }
}

export function textResult(text: string): McpToolResponse {
  return { content: [{ type: "text", text }] };
}

export function errorResult(err: unknown): McpToolResponse {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `❌ Error: ${message}` }], isError: true };
}
