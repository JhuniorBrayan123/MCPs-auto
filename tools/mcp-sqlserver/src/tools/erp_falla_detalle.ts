import { erpFallaDetalleSchema, type ErpFallaDetalleInput } from "../schemas/monitoring.js";
import { getDetalle } from "../domain/detalle.js";
import { DomainError } from "../utils/errors.js";
import { withSqlSearchClient, textResult, errorResult, type MonitoringToolDeps, type McpToolResponse } from "./shared.js";

export const name = "erp_falla_detalle";
export const inputSchema = erpFallaDetalleSchema.shape;

export async function execute(input: ErpFallaDetalleInput, deps: MonitoringToolDeps): Promise<McpToolResponse> {
  const { connection, idlog } = input;

  try {
    const { row } = await withSqlSearchClient(deps, connection, (client) =>
      getDetalle(client, { connection, idlog })
    );

    return textResult(`🔍 Detalle de idlog=${idlog} (conexión: ${connection})\n${JSON.stringify(row, null, 2)}`);
  } catch (err) {
    // "No existe" no es un error de infraestructura: se renderiza como un
    // resultado normal (sin isError), igual que el handler original.
    if (err instanceof DomainError && err.code === "LOG_NOT_FOUND") {
      return textResult(err.message);
    }
    return errorResult(err);
  }
}
