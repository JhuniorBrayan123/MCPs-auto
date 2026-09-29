#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStdioServer } from "./transport/stdio.js";
import { startHttpServer } from "./transport/http.js";
import { loadLocalEnvFile } from "./config/local-env-file.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnvFile(appRoot);

const transport = (process.env.MCP_TRANSPORT ?? "stdio").trim();
const start = transport === "stdio" ? startStdioServer() : startHttpServer();

start.catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error starting mcp-elk-observability: ${message}`);
  process.exitCode = 1;
});
