import { erpAnomaliasSchema, type ErpAnomaliasInput } from "../schemas/monitoring.js";
import { getAnomalias } from "../domain/anomalias.js";
import { withSqlSearchClient, textResult, errorResult, type MonitoringToolDeps, type McpToolResponse } from "./shared.js";

export const name = "erp_anomalias";
export const inputSchema = erpAnomaliasSchema.shape;

export async function execute(input: ErpAnomaliasInput, deps: MonitoringToolDeps): Promise<McpToolResponse> {
  const { connection, horasRecientes, diasBaseline, limit } = input;

  try {
    const { anomalias } = await withSqlSearchClient(deps, connection, (client) =>
      getAnomalias(client, { connection, horasRecientes, diasBaseline, limit })
    );

    return textResult(
      `🚨 Anomalías — últimas ${horasRecientes}h vs. promedio de los ${diasBaseline} días previos (conexión: ${connection})\nOrdenado de más a menos anómalo. Usa idlog_ejemplo con erp_falla_detalle para ver el mensaje completo.\n${JSON.stringify(anomalias, null, 2)}`
    );
  } catch (err) {
    return errorResult(err);
  }
}
