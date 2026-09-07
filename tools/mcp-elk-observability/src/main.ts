#!/usr/bin/env node
import { startStdioServer } from "./transport/stdio.js";

/**
 * Executable entrypoint: `node dist/main.js` after `npm run build`. Wires
 * env/config loading, the real `@elastic/elasticsearch` client, the MCP
 * server, and the stdio transport together (see transport/stdio.ts for the
 * actual bootstrap logic — this file only invokes it and handles a fatal
 * startup failure).
 *
 * Errors are logged to stderr, never stdout: stdout is the MCP JSON-RPC
 * message stream once connected, so anything written there outside the
 * protocol would corrupt it.
 */
startStdioServer().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error starting mcp-elk-observability: ${message}`);
  process.exitCode = 1;
});
