import { describe, expect, it } from "vitest";
import * as comparePeriodsTool from "./compare_periods.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import type { ToolDeps } from "./shared.js";
import type { SearchClientLike } from "../elastic/search.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";

function deps(client: SearchClientLike): ToolDeps {
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

describe("compare_periods tool", () => {
  it("requires service, current_period, and comparison_period", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(
      comparePeriodsTool.execute({ service: "PuntoVentaAPI" }, deps(client)),
    ).rejects.toThrow();
  });

  it("compares metrics between two periods with absolute + percent diffs", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await comparePeriodsTool.execute(
      { service: "PuntoVentaAPI", current_period: "1h", comparison_period: "24h" },
      deps(client),
    );
    const success = result as {
      service: string;
      current_period: string;
      comparison_period: string;
      metrics: Record<string, { current: number; comparison: number; diff_absolute: number }>;
    };
    expect(success.service).toBe("PuntoVentaAPI");
    expect(success.current_period).toBe("1h");
    expect(success.comparison_period).toBe("24h");
    expect(success.metrics.requests).toHaveProperty("diff_absolute");
  });

  it("maps the optional transaction filter through to the domain call", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await comparePeriodsTool.execute(
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
        current_period: "1h",
        comparison_period: "24h",
      },
      deps(client),
    );
    const success = result as { metrics: { requests: { current: number } } };
    expect(success.metrics.requests.current).toBeGreaterThan(0);
  });
});
