import { missingIndexesShape, type MissingIndexesInput } from "../schemas/tuning.js";
import { getMissingIndexes } from "../domain/tuning.js";
import { clampLimit } from "../sql/tuning.js";
import { withSqlSearchClient, textResult, type McpToolResponse } from "./shared.js";
import { withOverrides, type CatalogToolDeps } from "./catalog-shared.js";
import { tuningErrorResult, VIEW_SERVER_STATE } from "./tuning-shared.js";

export const name = "sqlserver_tuning_missing_indexes";
export const description =
  "Tuning (solo lectura): índices faltantes sugeridos por el optimizador (sys.dm_db_missing_index_*) en todo el servidor o en una base, ordenados por 'improvement measure'. Incluye un CREATE INDEX SUGERIDO como texto para que lo revise el DBA; este MCP nunca lo ejecuta. Requiere VIEW SERVER STATE.";
export const inputSchema = missingIndexesShape;

export async function execute(input: MissingIndexesInput, deps: CatalogToolDeps): Promise<McpToolResponse> {
  const { connection, database, server, user, password } = input;
  const limit = clampLimit(input.limit, 25, 500);
  try {
    const result = await withSqlSearchClient(withOverrides(deps, { server, user, password }), connection, (client) =>
      getMissingIndexes(client, { database, limit })
    );
    return textResult(
      [
        `🧭 Índices faltantes (conexión: ${connection}, base: ${result.database ?? "todas"}) — ${result.rows.length} sugerencias`,
        "⚠️ Las sentencias `create_index_sugerido` son SUGERENCIAS para revisión del DBA: no se ejecutan, pueden solaparse con índices existentes y las estadísticas se reinician al reiniciar el servicio.",
        JSON.stringify(result.rows, null, 2),
      ].join("\n")
    );
  } catch (err) {
    return tuningErrorResult(err, VIEW_SERVER_STATE);
  }
}
