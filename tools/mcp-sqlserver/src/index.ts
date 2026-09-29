import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { startStdioServer } from "./transport/stdio.js";
import { startHttpServer } from "./transport/http.js";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
dotenv.config({ path: envPath });

const transport = (process.env.MCP_TRANSPORT ?? "stdio").trim();
const start = transport === "stdio" ? startStdioServer() : startHttpServer();

start.catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error starting mcp-sqlserver: ${message}`);
  process.exitCode = 1;
});
