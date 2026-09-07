import { describe, expect, it } from "vitest";
import * as getServiceErrorsTool from "./get_service_errors.js";
import * as getEndpointErrorsTool from "./get_endpoint_errors.js";
import * as getTopErrorsTool from "./get_top_errors.js";
import {
  fakeSearchClientFromDocs,
  routedSearchClient,
} from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import errorDocs from "../../test/fixtures/errors.json";
import type { ToolDeps } from "./shared.js";
import type { SearchClientLike } from "../elastic/search.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";

function routedDeps(): ToolDeps {
  const client = routedSearchClient({
    [TRACE_INDEX]: fakeSearchClientFromDocs(transactions as Record<string, unknown>[]),
    [ERROR_INDEX]: fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]),
  });
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

function errorOnlyDeps(): ToolDeps {
  const client: SearchClientLike = fakeSearchClientFromDocs(
    errorDocs as Record<string, unknown>[],
  );
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

describe("get_service_errors tool", () => {
  it("reports http_4xx/http_5xx/event_outcome/apm_errors as independent fields", async () => {
    const result = await getServiceErrorsTool.execute(
      { service: "PuntoVentaAPI" },
      routedDeps(),
    );
    const success = result as Record<string, unknown>;
    expect(success.service).toBe("PuntoVentaAPI");
    expect(typeof success.http_4xx).toBe("number");
    expect(typeof success.http_5xx).toBe("number");
    expect(typeof success.apm_errors).toBe("number");
  });

  it("returns an error envelope for a nonexistent service", async () => {
    const result = await getServiceErrorsTool.execute({ service: "Typo123" }, routedDeps());
    expect(result).toEqual({
      error: { code: "SERVICE_NOT_FOUND", message: expect.any(String) },
    });
  });
});

describe("get_endpoint_errors tool", () => {
  it("requires service and transaction", async () => {
    await expect(
      getEndpointErrorsTool.execute({ service: "PuntoVentaAPI" }, routedDeps()),
    ).rejects.toThrow();
  });

  it("returns failed_requests/error_rate/4xx/5xx/top_errors", async () => {
    const result = await getEndpointErrorsTool.execute(
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
      },
      routedDeps(),
    );
    const success = result as Record<string, unknown>;
    expect(success).toHaveProperty("failed_requests");
    expect(success).toHaveProperty("error_rate");
    expect(success).toHaveProperty("4xx");
    expect(success).toHaveProperty("5xx");
    expect(Array.isArray(success.top_errors)).toBe(true);
  });
});

describe("get_top_errors tool", () => {
  it("has no required fields and reports grouping_field_used per entry", async () => {
    const result = await getTopErrorsTool.execute({}, errorOnlyDeps());
    const success = result as { errors: { key: string; grouping_field_used?: string }[] };
    expect(success.errors.length).toBeGreaterThan(0);
    const groupingKeyGroup = success.errors.find((e) => e.key === "grp-sqlexception-001");
    expect(groupingKeyGroup?.grouping_field_used).toBe("error.grouping_key");
  });

  it("clamps limit above 100 down to 100 via the schema", async () => {
    const result = await getTopErrorsTool.execute({ limit: 500 }, errorOnlyDeps());
    const success = result as { errors: unknown[] };
    expect(success.errors.length).toBeLessThanOrEqual(100);
  });
});
