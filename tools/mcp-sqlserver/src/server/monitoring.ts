import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import type { MonitoringToolDeps, McpToolResponse } from "../tools/shared.js";
import * as erpFallasResumenTool from "../tools/erp_fallas_resumen.js";
import * as erpFallasPorModuloTool from "../tools/erp_fallas_por_modulo.js";
import * as erpFallaDetalleTool from "../tools/erp_falla_detalle.js";
import * as erpAnomaliasTool from "../tools/erp_anomalias.js";
import * as erpFallasRangoTool from "../tools/erp_fallas_rango.js";

export type { MonitoringToolDeps } from "../tools/shared.js";

/** Shape every `tools/erp_*.ts` module conforms to. */
interface MonitoringToolModule {
  name: string;
  inputSchema: ZodRawShape;
  execute: (input: any, deps: MonitoringToolDeps) => Promise<McpToolResponse>;
}

/** The 5 `SRExcepcion` monitoring tools, in the same order as the original `monitoring-tools.ts`. */
const TOOL_MODULES: MonitoringToolModule[] = [
  erpFallasResumenTool,
  erpFallasPorModuloTool,
  erpFallaDetalleTool,
  erpAnomaliasTool,
  erpFallasRangoTool,
];

export const MONITORING_TOOL_NAMES: string[] = TOOL_MODULES.map((tool) => tool.name);

/**
 * Registers the 5 `SRExcepcion` monitoring tools against `server`
 * (transport-agnostic per `mcp-elk-observability/src/server/index.ts`'s
 * pattern — this file never touches `mssql` or stdio directly). Tool names,
 * parameters, and response text are unchanged from the original
 * `monitoring-tools.ts`; only where the logic lives has moved.
 */
export function registerMonitoringTools(server: McpServer, deps: MonitoringToolDeps): void {
  for (const tool of TOOL_MODULES) {
    server.tool(tool.name, tool.inputSchema, async (input: any) => tool.execute(input, deps));
  }
}
