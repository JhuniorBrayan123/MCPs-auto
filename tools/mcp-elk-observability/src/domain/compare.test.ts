import { describe, expect, it } from "vitest";
import { comparePeriods } from "./compare.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";

const TRACE_INDEX = "traces-apm-default";

describe("comparePeriods", () => {
  it("compares requests/throughput_rpm/avg_ms/p95_ms/p99_ms/error_rate with absolute+percent diffs", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await comparePeriods(
      client,
      { service: "PuntoVentaAPI", currentPeriod: "1h", comparisonPeriod: "24h" },
      TRACE_INDEX,
    );

    expect(result.service).toBe("PuntoVentaAPI");
    expect(result.current_period).toBe("1h");
    expect(result.comparison_period).toBe("24h");

    for (const metricKey of [
      "requests",
      "throughput_rpm",
      "avg_ms",
      "p95_ms",
      "p99_ms",
      "error_rate",
    ] as const) {
      const metric = result.metrics[metricKey];
      expect(metric).toHaveProperty("current");
      expect(metric).toHaveProperty("comparison");
      expect(metric).toHaveProperty("diff_absolute");
      expect(metric).toHaveProperty("diff_percent");
    }
  });

  it("returns diff_percent null (not Infinity/NaN) when the comparison value is 0", async () => {
    // Both periods resolve against the same fixture set here (the fake ES
    // simulator treats @timestamp range clauses as always-satisfied), so we
    // isolate the zero-denominator case by comparing a service against a
    // transaction filter that matches nothing in the "comparison" period.
    const client = fakeSearchClientFromDocs([]);
    const result = await comparePeriods(
      client,
      { service: "GhostAPI", currentPeriod: "1h", comparisonPeriod: "24h" },
      TRACE_INDEX,
    );

    expect(result.metrics.requests.comparison).toBe(0);
    expect(result.metrics.requests.diff_percent).toBeNull();
    expect(result.metrics.avg_ms.diff_percent).toBeNull();
  });

  it("compares at the transaction level when transaction is provided", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await comparePeriods(
      client,
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
        currentPeriod: "1h",
        comparisonPeriod: "24h",
      },
      TRACE_INDEX,
    );
    expect(result.metrics.requests.current).toBeGreaterThan(0);
  });

  it("computes diff_absolute = current - comparison for a simple metric", async () => {
    const client = fakeSearchClientFromDocs([]);
    const result = await comparePeriods(
      client,
      { service: "GhostAPI", currentPeriod: "1h", comparisonPeriod: "24h" },
      TRACE_INDEX,
    );
    expect(result.metrics.requests.diff_absolute).toBe(
      result.metrics.requests.current - result.metrics.requests.comparison,
    );
  });
});
