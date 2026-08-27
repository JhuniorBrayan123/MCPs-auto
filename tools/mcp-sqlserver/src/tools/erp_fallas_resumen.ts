import { erpFallasResumenSchema, type ErpFallasResumenInput } from "../schemas/monitoring.js";
import { getResumen } from "../domain/resumen.js";
import { parseRangoRelativoOFijo } from "../domain/shared.js";
import { withSqlSearchClient, textResult, errorResult, type MonitoringToolDeps, type McpToolResponse } from "./shared.js";

export const name = "erp_fallas_resumen";
export const inputSchema = erpFallasResumenSchema.shape;

export async function execute(input: ErpFallasResumenInput, deps: MonitoringToolDeps): Promise<McpToolResponse> {
  const { connection, dias, desde, hasta } = input;

  try {
    // Validado ANTES de abrir la conexión: una fecha inválida falla rápido,
    // sin gastar un intento de conexión contra un servidor que puede estar
    // lento o inalcanzable.
    const { fechaDesde, fechaHasta } = parseRangoRelativoOFijo({ dias, desde, hasta });

    const { etiquetaRango, recordset } = await withSqlSearchClient(deps, connection, (client) =>
      getResumen(client, { connection, dias, desde, fechaDesde, fechaHasta })
    );

    return textResult(
      `📊 Resumen de fallas — ${etiquetaRango} (conexión: ${connection})\n${JSON.stringify(recordset, null, 2)}`
    );
  } catch (err) {
    return errorResult(err);
  }
}
