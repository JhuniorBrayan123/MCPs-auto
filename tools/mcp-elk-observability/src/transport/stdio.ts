import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { loadEnv } from "../config/env.js";
import { createElasticsearchClient, type ClientFactory } from "../elastic/client.js";
import type { SearchClientLike } from "../elastic/search.js";
import { createServer } from "../server/index.js";
import type { ToolDeps } from "../tools/shared.js";

export interface StdioServerOptions {
  /** Defaults to `process.env`. Injectable for tests. */
  env?: Record<string, string | undefined>;
  /** Defaults to the real `@elastic/elasticsearch` `Client` constructor. Injectable for tests. */
  clientFactory?: ClientFactory;
  /** Defaults to a real `StdioServerTransport` (stdin/stdout). Injectable for tests. */
  transport?: Transport;
}

/**
 * Stdio transport bootstrap (design.md §1: transport is the only layer that
 * knows about stdin/stdout, and the only layer that would change if this
 * server grew an HTTP/SSE transport later per FR-23). No business logic
 * lives here — it only validates env (`config/env.ts`), constructs the real
 * Elasticsearch client, builds the `ToolDeps` every tool needs, creates the
 * MCP server (`server/index.ts`), and connects it to the transport.
 */
export async function startStdioServer(options: StdioServerOptions = {}): Promise<McpServer> {
  const config = loadEnv(options.env ?? process.env);

  const esClient = createElasticsearchClient(
    {
      elasticsearchUrl: config.elasticsearchUrl,
      elasticsearchApiKey: config.elasticsearchApiKey,
    },
    options.clientFactory,
  );

  const deps: ToolDeps = {
    client: esClient as unknown as SearchClientLike,
    traceIndex: config.apmTraceIndex,
    errorIndex: config.apmErrorIndex,
    extraSensitiveFields: config.extraSensitiveFields,
  };

  const server = createServer(deps);
  const transport = options.transport ?? new StdioServerTransport();
  await server.connect(transport);

  return server;
}
