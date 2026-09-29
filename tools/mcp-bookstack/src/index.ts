import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStdioServer } from "./transport/stdio.js";
import { startHttpServer } from "./transport/http.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "..", ".env") });

const transport = (process.env.MCP_TRANSPORT ?? "stdio").trim();
const start = transport === "stdio" ? startStdioServer() : startHttpServer();

start.catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error starting mcp-bookstack: ${message}`);
  process.exitCode = 1;
});
