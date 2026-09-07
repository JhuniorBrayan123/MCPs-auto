import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, TOOL_NAMES } from "./index.js";
import {
  fakeSearchClientFromDocs,
  routedSearchClient,
} from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import errorDocs from "../../test/fixtures/errors.json";
import type { ToolDeps } from "../tools/shared.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";

const EXPECTED_TOOL_NAMES = [
  "list_services",
  "list_endpoints",
  "get_service_health",
  "get_endpoint_health",
  "get_endpoint_latency",
  "get_slow_services",
  "get_slow_endpoints",
  "get_service_errors",
  "get_endpoint_errors",
  "get_top_errors",
  "trace_request",
  "get_trace_dependencies",
  "compare_periods",
];

function testDeps(): ToolDeps {
  const client = routedSearchClient({
    [TRACE_INDEX]: fakeSearchClientFromDocs(transactions as Record<string, unknown>[]),
    [ERROR_INDEX]: fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]),
  });
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

async function connectedClient(deps: ToolDeps) {
  const server = createServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("createServer", () => {
  it("registers exactly the 13 documented tools, no more, no fewer", () => {
    expect(TOOL_NAMES).toHaveLength(13);
    expect(new Set(TOOL_NAMES)).toEqual(new Set(EXPECTED_TOOL_NAMES));
  });

  it("exposes all 13 tools over the MCP protocol, each with an input schema", async () => {
    const client = await connectedClient(testDeps());
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(13);
    for (const toolName of EXPECTED_TOOL_NAMES) {
      const tool = tools.find((t) => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.description).toBe("string");
    }
  });

  it("executes a tool call end-to-end and returns the shaped JSON response", async () => {
    const client = await connectedClient(testDeps());
    const result = await client.callTool({ name: "list_services", arguments: {} });
    expect(result.isError).toBeFalsy();
    const [firstContent] = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(firstContent.text);
    expect(parsed.period).toBe("1h");
    expect(Array.isArray(parsed.services)).toBe(true);
  });

  it("returns isError:true with the taxonomy error envelope for a domain not-found, without throwing", async () => {
    const client = await connectedClient(testDeps());
    const result = await client.callTool({
      name: "get_service_health",
      arguments: { service: "Typo123" },
    });
    expect(result.isError).toBe(true);
    const [firstContent] = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(firstContent.text);
    expect(parsed.error.code).toBe("SERVICE_NOT_FOUND");
  });
});
