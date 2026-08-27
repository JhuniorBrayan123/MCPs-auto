import { erpFallasRangoSchema, type ErpFallasRangoInput } from "../schemas/monitoring.js";
import { getRango } from "../domain/rango.js";
import { parseRangoFijo, formatearFechaLocal } from "../domain/shared.js";
import { withSqlSearchClient, textResult, errorResult, type MonitoringToolDeps, type McpToolResponse } from "./shared.js";

export const name = "erp_fallas_rango";
export const inputSchema = erpFallasRangoSchema.shape;

export async function execute(input: ErpFallasRangoInput, deps: MonitoringToolDeps): Promise<McpToolResponse> {
  const { connection, desde, hasta, modulo, limit } = input;

  try {
    // Validado ANTES de abrir la conexión, igual que erp_fallas_resumen.
    const { fechaDesde, fechaHasta } = parseRangoFijo({ desde, hasta });

    const { total, filas } = await withSqlSearchClient(deps, connection, (client) =>
      getRango(client, { connection, fechaDesde, fechaHasta, modulo, limit })
    );

    const avisoTope =
      total > limit
        ? `\n⚠️ Hay ${total} filas en total en este rango, se muestran solo las primeras ${limit}. Filtra por 'modulo', acorta el rango, o usa erp_fallas_por_modulo / erp_anomalias para un resumen en vez del detalle fila por fila.`
        : "";

    return textResult(
      `🕐 Fallas entre ${formatearFechaLocal(fechaDesde)} y ${formatearFechaLocal(fechaHasta)} (conexión: ${connection}${modulo ? `, módulo: ${modulo}` : ""})\nTotal en el rango: ${total}. Mostrando: ${filas.length}.${avisoTope}\nUsa 'idlog' con erp_falla_detalle para ver el mensaje y la traza completos de una fila puntual.\n${JSON.stringify(filas, null, 2)}`
    );
  } catch (err) {
    return errorResult(err);
  }
}
