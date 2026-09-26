import { topQueriesShape, type TopQueriesInput } from "../schemas/tuning.js";
import { getTopQueries } from "../domain/tuning.js";
import { clampLimit, STATEMENT_TEXT_MAX } from "../sql/tuning.js";
import { withSqlSearchClient, textResult, type McpToolResponse } from "./shared.js";
import { withOverrides, type CatalogToolDeps } from "./catalog-shared.js";
import { tuningErrorResult, VIEW_SERVER_STATE } from "./tuning-shared.js";

export const name = "sqlserver_tuning_top_queries";
export const description =
  "Tuning (solo lectura): consultas más costosas del plan cache (sys.dm_exec_query_stats) ordenadas por cpu, duration, reads, writes o executions; con base, ejecuciones, tiempos totales/promedio en ms, lecturas lógicas y el texto de la sentencia. Requiere VIEW SERVER STATE.";
export const inputSchema = topQueriesShape;

export async function execute(input: TopQueriesInput, deps: CatalogToolDeps): Promise<McpToolResponse> {
  const { connection, database, server, user, password } = input;
  const orderBy = input.orderBy ?? "cpu";
  const limit = clampLimit(input.limit, 20, 200);
  try {
    const result = await withSqlSearchClient(withOverrides(deps, { server, user, password }), connection, (client) =>
      getTopQueries(client, { database, orderBy, limit })
    );
    return textResult(
      [
        `🔥 Top ${result.rows.length} consultas por ${orderBy} (conexión: ${connection}, base: ${result.database ?? "todas"})`,
        `ℹ️ Solo cubre planes que siguen en caché (se vacía al reiniciar o por presión de memoria). Texto recortado a ${STATEMENT_TEXT_MAX} caracteres.`,
        JSON.stringify(result.rows, null, 2),
      ].join("\n")
    );
  } catch (err) {
    return tuningErrorResult(err, VIEW_SERVER_STATE);
  }
}
