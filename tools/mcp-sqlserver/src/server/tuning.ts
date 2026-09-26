import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import type { McpToolResponse } from "../tools/shared.js";
import type { CatalogToolDeps } from "../tools/catalog-shared.js";
import * as missingIndexesTool from "../tools/sqlserver_tuning_missing_indexes.js";
import * as topQueriesTool from "../tools/sqlserver_tuning_top_queries.js";
import * as indexUsageTool from "../tools/sqlserver_tuning_index_usage.js";
import * as blockingTool from "../tools/sqlserver_tuning_blocking.js";

interface TuningToolModule {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  execute: (input: any, deps: CatalogToolDeps) => Promise<McpToolResponse>;
}

const TOOL_MODULES: TuningToolModule[] = [missingIndexesTool, topQueriesTool, indexUsageTool, blockingTool];

export const TUNING_TOOL_NAMES: string[] = TOOL_MODULES.map((tool) => tool.name);

/** Registra las tools de tuning (solo lectura, DMVs) sobre `server`. */
export function registerTuningTools(server: McpServer, deps: CatalogToolDeps): void {
  for (const tool of TOOL_MODULES) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (input: any) => tool.execute(input, deps));
  }
}
