import { indexUsageShape, type IndexUsageInput } from "../schemas/tuning.js";
import { getIndexUsage } from "../domain/tuning.js";
import { clampLimit } from "../sql/tuning.js";
import { withSqlSearchClient, textResult, type McpToolResponse } from "./shared.js";
import { withOverrides, type CatalogToolDeps } from "./catalog-shared.js";
import { tuningErrorResult, VIEW_SERVER_STATE } from "./tuning-shared.js";

export const name = "sqlserver_tuning_index_usage";
export const description =
  "Tuning (solo lectura): uso de los índices de UNA base (seeks/scans/lookups/updates de sys.dm_db_index_usage_stats, filas y tamaño en MB), marcando 'sin_uso' los que solo reciben escrituras. Las estadísticas se reinician al reiniciar el servicio. Requiere VIEW SERVER STATE y acceso a la base.";
export const inputSchema = indexUsageShape;

export async function execute(input: IndexUsageInput, deps: CatalogToolDeps): Promise<McpToolResponse> {
  const { connection, database, server, user, password } = input;
  const onlyUnused = input.onlyUnused ?? false;
  const limit = clampLimit(input.limit, 200, 2000);
  try {
    const result = await withSqlSearchClient(withOverrides(deps, { server, user, password }), connection, (client) =>
      getIndexUsage(client, { database, onlyUnused, limit })
    );
    const sinUso = result.rows.filter((row) => row.sin_uso).length;
    const desde = result.serverStartTime ? new Date(result.serverStartTime).toISOString() : "desconocido";
    return textResult(
      [
        `📊 Uso de índices en \`${result.database}\` (conexión: ${connection}${onlyUnused ? ", solo sin uso" : ""}) — ${result.rows.length} índices, ${sinUso} sin uso`,
        `⚠️ Las estadísticas de uso se reinician al reiniciar el servicio de SQL Server (último arranque: ${desde}). Un índice 'sin_uso' puede servir a procesos mensuales/anuales: confirmar con el DBA antes de proponer eliminarlo.`,
        JSON.stringify(result.rows, null, 2),
      ].join("\n")
    );
  } catch (err) {
    return tuningErrorResult(err, `${VIEW_SERVER_STATE} y VIEW DATABASE STATE en la base "${database}"`);
  }
}
