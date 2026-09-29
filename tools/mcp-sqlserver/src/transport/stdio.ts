import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../server/index.js";
import { loadConnectionProfiles, createMakeSqlConfig, describeProfiles } from "../config/sql-config.js";

export async function startStdioServer(env: Record<string, string | undefined> = process.env): Promise<McpServer> {
  const profiles = loadConnectionProfiles(env);
  const makeSqlConfig = createMakeSqlConfig(profiles);

  const server = createServer({ makeSqlConfig });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(" MCP SQL Server corriendo (stdio)");
  console.error(`   Perfiles disponibles: ${describeProfiles(profiles)}`);

  return server;
}
