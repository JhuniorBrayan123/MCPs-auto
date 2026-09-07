import { describe, expect, it } from "vitest";
import * as listServicesTool from "./list_services.js";
import * as listEndpointsTool from "./list_endpoints.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import type { ToolDeps } from "./shared.js";
import type { SearchClientLike } from "../elastic/search.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";

function deps(client: SearchClientLike): ToolDeps {
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

describe("list_services tool", () => {
  it("exposes its documented MCP name, description, and zod input schema", () => {
    expect(listServicesTool.name).toBe("list_services");
    expect(typeof listServicesTool.description).toBe("string");
    expect(listServicesTool.description.length).toBeGreaterThan(0);
    expect(typeof listServicesTool.inputSchema.parse).toBe("function");
  });

  it("validates input, calls listServices, and shapes the response per specification.md", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServicesTool.execute({}, deps(client));
    expect(result).not.toHaveProperty("error");
    const success = result as { period: string; services: unknown[]; environment?: string };
    expect(success.period).toBe("1h");
    expect(Array.isArray(success.services)).toBe(true);
    expect(success.environment).toBeUndefined();
  });

  it("echoes environment only when supplied", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServicesTool.execute({ environment: "produccion" }, deps(client));
    expect((result as { environment?: string }).environment).toBe("produccion");
  });

  it("rejects an invalid period before reaching the domain layer", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(listServicesTool.execute({ period: "1 hour" }, deps(client))).rejects.toThrow();
  });
});

describe("list_endpoints tool", () => {
  it("exposes its documented MCP name and schema", () => {
    expect(listEndpointsTool.name).toBe("list_endpoints");
    expect(typeof listEndpointsTool.inputSchema.parse).toBe("function");
  });

  it("rejects missing required service before reaching the domain layer", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(listEndpointsTool.execute({}, deps(client))).rejects.toThrow();
  });

  it("validates input, calls listEndpoints, and shapes the response", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listEndpointsTool.execute({ service: "PuntoVentaAPI" }, deps(client));
    const success = result as { service: string; endpoints: { transaction: string }[] };
    expect(success.service).toBe("PuntoVentaAPI");
    expect(Array.isArray(success.endpoints)).toBe(true);
    expect(
      success.endpoints.some(
        (e) => e.transaction === "GET DocumentosContables/GetDocumentoContableVista",
      ),
    ).toBe(true);
  });
});
