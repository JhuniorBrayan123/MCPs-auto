import { describe, expect, it } from "vitest";
import * as getServiceHealthTool from "./get_service_health.js";
import * as getEndpointHealthTool from "./get_endpoint_health.js";
import * as getEndpointLatencyTool from "./get_endpoint_latency.js";
import * as getSlowServicesTool from "./get_slow_services.js";
import * as getSlowEndpointsTool from "./get_slow_endpoints.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import type { ToolDeps } from "./shared.js";
import type { SearchClientLike } from "../elastic/search.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";

function deps(client: SearchClientLike): ToolDeps {
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

describe("get_service_health tool", () => {
  it("exposes its documented MCP name", () => {
    expect(getServiceHealthTool.name).toBe("get_service_health");
  });

  it("returns the objective health shape with no status/health classification field", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getServiceHealthTool.execute({ service: "PuntoVentaAPI" }, deps(client));
    const success = result as Record<string, unknown>;
    expect(success.service).toBe("PuntoVentaAPI");
    expect(success).toHaveProperty("latency");
    expect(success).toHaveProperty("errors");
    expect(success).toHaveProperty("status_codes");
    expect(success).not.toHaveProperty("status");
    expect(success).not.toHaveProperty("health");
  });

  it("returns an error envelope (never throws) for a nonexistent service", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getServiceHealthTool.execute({ service: "Typo123" }, deps(client));
    expect(result).toEqual({
      error: { code: "SERVICE_NOT_FOUND", message: expect.any(String) },
    });
  });
});

describe("get_endpoint_health tool", () => {
  it("requires service and transaction", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(
      getEndpointHealthTool.execute({ service: "PuntoVentaAPI" }, deps(client)),
    ).rejects.toThrow();
  });

  it("returns the health shape plus a transaction field", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getEndpointHealthTool.execute(
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
      },
      deps(client),
    );
    const success = result as Record<string, unknown>;
    expect(success.service).toBe("PuntoVentaAPI");
    expect(success.transaction).toBe("GET DocumentosContables/GetDocumentoContableVista");
  });
});

describe("get_endpoint_latency tool", () => {
  it("returns the full percentile set", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getEndpointLatencyTool.execute(
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
      },
      deps(client),
    );
    const success = result as Record<string, unknown>;
    expect(success).toHaveProperty("avg_ms");
    expect(success).toHaveProperty("p50_ms");
    expect(success).toHaveProperty("p75_ms");
    expect(success).toHaveProperty("p90_ms");
    expect(success).toHaveProperty("p95_ms");
    expect(success).toHaveProperty("p99_ms");
    expect(success).toHaveProperty("max_ms");
  });

  it("returns TRANSACTION_NOT_FOUND as an error envelope", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getEndpointLatencyTool.execute(
      { service: "PuntoVentaAPI", transaction: "Nope" },
      deps(client),
    );
    expect(result).toEqual({
      error: { code: "TRANSACTION_NOT_FOUND", message: expect.any(String) },
    });
  });
});

describe("get_slow_services tool", () => {
  it("defaults percentile to 95 and limit to 10", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getSlowServicesTool.execute({}, deps(client));
    const success = result as { percentile: number; services: unknown[] };
    expect(success.percentile).toBe(95);
    expect(success.services.length).toBeLessThanOrEqual(10);
  });
});

describe("get_slow_endpoints tool", () => {
  it("requires service and returns fixed avg/p95/p99 fields", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(getSlowEndpointsTool.execute({}, deps(client))).rejects.toThrow();
    const result = await getSlowEndpointsTool.execute({ service: "PuntoVentaAPI" }, deps(client));
    const success = result as { service: string; endpoints: Record<string, unknown>[] };
    expect(success.service).toBe("PuntoVentaAPI");
    for (const endpoint of success.endpoints) {
      expect(endpoint).toHaveProperty("avg_ms");
      expect(endpoint).toHaveProperty("p95_ms");
      expect(endpoint).toHaveProperty("p99_ms");
    }
  });
});
