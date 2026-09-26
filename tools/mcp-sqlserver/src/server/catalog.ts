import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import type { McpToolResponse } from "../tools/shared.js";
import type { CatalogToolDeps } from "../tools/catalog-shared.js";
import * as listDatabasesTool from "../tools/sqlserver_list_databases.js";
import * as searchObjectsTool from "../tools/sqlserver_search_objects.js";

export type { CatalogToolDeps } from "../tools/catalog-shared.js";

interface CatalogToolModule {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  execute: (input: any, deps: CatalogToolDeps) => Promise<McpToolResponse>;
}

const TOOL_MODULES: CatalogToolModule[] = [listDatabasesTool, searchObjectsTool];

export const CATALOG_TOOL_NAMES: string[] = TOOL_MODULES.map((tool) => tool.name);

/** Registra las tools de catálogo multi-base (solo lectura) sobre `server`. */
export function registerCatalogTools(server: McpServer, deps: CatalogToolDeps): void {
  for (const tool of TOOL_MODULES) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (input: any) => tool.execute(input, deps));
  }
}
