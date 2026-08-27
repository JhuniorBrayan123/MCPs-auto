import { erpFallasPorModuloSchema, type ErpFallasPorModuloInput } from "../schemas/monitoring.js";
import { getPorModulo } from "../domain/porModulo.js";
import { withSqlSearchClient, textResult, errorResult, type MonitoringToolDeps, type McpToolResponse } from "./shared.js";

export const name = "erp_fallas_por_modulo";
export const inputSchema = erpFallasPorModuloSchema.shape;

export async function execute(
  input: ErpFallasPorModuloInput,
  deps: MonitoringToolDeps
): Promise<McpToolResponse> {
  const { connection, dias, modulo, limit } = input;

  try {
    const { recordset } = await withSqlSearchClient(deps, connection, (client) =>
      getPorModulo(client, { connection, dias, modulo, limit })
    );

    return textResult(
      `📊 Fallas en '${modulo}' — últimos ${dias} día(s) (conexión: ${connection})\n${JSON.stringify(recordset, null, 2)}`
    );
  } catch (err) {
    return errorResult(err);
  }
}
