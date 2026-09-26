import sql from "mssql";
import type { SqlPoolFactory } from "../sql/client.js";
import type { ConnectionName } from "../connection-profiles.js";
import type { MonitoringToolDeps } from "./shared.js";

export interface SqlOverrides {
  server?: string;
  database?: string;
  user?: string;
  password?: string;
  timeout?: number;
}

/** Dependencias de las tools de catálogo: como las de monitoreo, pero aceptando overrides. */
export interface CatalogToolDeps {
  makeSqlConfig: (connection: ConnectionName, overrides?: SqlOverrides) => sql.config;
  poolFactory?: SqlPoolFactory;
}

/** Adapta las deps para reutilizar `withSqlSearchClient` con los overrides de la llamada. */
export function withOverrides(deps: CatalogToolDeps, overrides: SqlOverrides): MonitoringToolDeps {
  return {
    makeSqlConfig: (connection) => deps.makeSqlConfig(connection, overrides),
    poolFactory: deps.poolFactory,
  };
}
