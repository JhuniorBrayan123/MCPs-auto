import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolDeps } from "../tools/shared.js";
import * as listServicesTool from "../tools/list_services.js";
import * as listEndpointsTool from "../tools/list_endpoints.js";
import * as getServiceHealthTool from "../tools/get_service_health.js";
import * as getEndpointHealthTool from "../tools/get_endpoint_health.js";
import * as getEndpointLatencyTool from "../tools/get_endpoint_latency.js";
import * as getSlowServicesTool from "../tools/get_slow_services.js";
import * as getSlowEndpointsTool from "../tools/get_slow_endpoints.js";
import * as getServiceErrorsTool from "../tools/get_service_errors.js";
import * as getEndpointErrorsTool from "../tools/get_endpoint_errors.js";
import * as getTopErrorsTool from "../tools/get_top_errors.js";
import * as traceRequestTool from "../tools/trace_request.js";
import * as getTraceDependenciesTool from "../tools/get_trace_dependencies.js";
import * as comparePeriodsTool from "../tools/compare_periods.js";

/**
 * Shape every `tools/<name>.ts` module conforms to: an MCP tool identifier,
 * a human-readable description, its Zod input schema, and a thin
 * `execute()` that validates + calls the domain layer + shapes/sanitizes
 * the response (see tools/shared.ts's `runTool`).
 */
interface ToolModule {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (rawInput: unknown, deps: ToolDeps) => Promise<unknown>;
}

/** All 13 v0.1 tools (design.md §6/specification.md), in specification order. */
const TOOL_MODULES: ToolModule[] = [
  listServicesTool,
  listEndpointsTool,
  getServiceHealthTool,
  getEndpointHealthTool,
  getEndpointLatencyTool,
  getSlowServicesTool,
  getSlowEndpointsTool,
  getServiceErrorsTool,
  getEndpointErrorsTool,
  getTopErrorsTool,
  traceRequestTool,
  getTraceDependenciesTool,
  comparePeriodsTool,
];

export const TOOL_NAMES: string[] = TOOL_MODULES.map((tool) => tool.name);

function isErrorEnvelope(value: unknown): boolean {
  return typeof value === "object" && value !== null && "error" in value;
}

/**
 * Builds the MCP server (transport-agnostic per design.md §1) and registers
 * exactly the 13 documented tools, each wiring its own Zod input schema.
 * `deps` carries the injected search client and index/config values so the
 * server itself never constructs the real `@elastic/elasticsearch` client —
 * that happens once in the entrypoint (`src/main.ts`).
 */
export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: "mcp-elk-observability", version: "0.1.0" });

  for (const tool of TOOL_MODULES) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: unknown) => {
        const result = await tool.execute(args, deps);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          isError: isErrorEnvelope(result),
        };
      },
    );
  }

  return server;
}
