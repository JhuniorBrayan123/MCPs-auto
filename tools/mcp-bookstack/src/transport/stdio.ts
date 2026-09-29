import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BookStackClient } from "../bookstackClient.js";
import { createServer } from "../server/index.js";

export async function startStdioServer(): Promise<McpServer> {
  const bookStack = new BookStackClient();
  const server = createServer({ bookStack });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
