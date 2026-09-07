import { describe, expect, it } from "vitest";
import {
  getServiceHealth,
  getEndpointHealth,
  getSlowServices,
  getSlowEndpoints,
} from "./health.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import { DomainError } from "../utils/errors.js";

const TRACE_INDEX = "traces-apm-default";

describe("getServiceHealth", () => {
  it("returns requests/throughput/latency/errors/status_codes with no health classification field", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getServiceHealth(client, { service: "PuntoVentaAPI" }, TRACE_INDEX);

    expect(result.service).toBe("PuntoVentaAPI");
    expect(result.period).toBe("1h");
    expect(typeof result.requests).toBe("number");
    expect(typeof result.throughput_rpm).toBe("number");
    expect(result.latency).toEqual(
      expect.objectContaining({
        avg_ms: expect.any(Number),
        p50_ms: expect.any(Number),
        p95_ms: expect.any(Number),
        p99_ms: expect.any(Number),
        max_ms: expect.any(Number),
      }),
    );
    expect(result.errors).toEqual(
      expect.objectContaining({ count: expect.any(Number), rate_percent: expect.any(Number) }),
    );
    expect(result.status_codes).toEqual(
      expect.objectContaining({
        "2xx": expect.any(Number),
        "3xx": expect.any(Number),
        "4xx": expect.any(Number),
        "5xx": expect.any(Number),
      }),
    );
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("health");
  });

  it("counts the failure-outcome doc as an error and the 500 status under 5xx", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getServiceHealth(client, { service: "PuntoVentaAPI" }, TRACE_INDEX);
    expect(result.errors.count).toBeGreaterThanOrEqual(1);
    expect(result.status_codes["5xx"]).toBeGreaterThanOrEqual(1);
  });

  it("excludes OPTIONS requests by default", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const withOptions = await getServiceHealth(
      client,
      { service: "PuntoVentaAPI", includeOptions: true },
      TRACE_INDEX,
    );
    const withoutOptions = await getServiceHealth(client, { service: "PuntoVentaAPI" }, TRACE_INDEX);
    expect(withoutOptions.requests).toBeLessThan(withOptions.requests);
  });

  it("throws SERVICE_NOT_FOUND for a nonexistent service", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(getServiceHealth(client, { service: "Typo123" }, TRACE_INDEX)).rejects.toMatchObject({
      code: "SERVICE_NOT_FOUND",
    });
    await expect(
      getServiceHealth(client, { service: "Typo123" }, TRACE_INDEX),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("getEndpointHealth", () => {
  it("returns the same shape as getServiceHealth plus a transaction field", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getEndpointHealth(
      client,
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
      },
      TRACE_INDEX,
    );
    expect(result.service).toBe("PuntoVentaAPI");
    expect(result.transaction).toBe("GET DocumentosContables/GetDocumentoContableVista");
    expect(result.latency.avg_ms).toBeGreaterThanOrEqual(0);
  });

  it("throws TRANSACTION_NOT_FOUND when the transaction does not exist for the service", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(
      getEndpointHealth(client, { service: "PuntoVentaAPI", transaction: "Nope" }, TRACE_INDEX),
    ).rejects.toMatchObject({ code: "TRANSACTION_NOT_FOUND" });
  });
});

describe("getSlowServices", () => {
  it("orders services descending by the requested percentile, dynamically naming the percentile field", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getSlowServices(client, { percentile: 95 }, TRACE_INDEX);
    expect(result.percentile).toBe(95);
    expect(result.services.length).toBeGreaterThan(0);
    for (const svc of result.services) {
      expect(svc).toHaveProperty("p95_ms");
      expect(svc).toHaveProperty("avg_ms");
      expect(svc).toHaveProperty("requests");
    }
    for (let i = 1; i < result.services.length; i++) {
      const prevP = (result.services[i - 1] as unknown as Record<string, number>).p95_ms;
      const curP = (result.services[i] as unknown as Record<string, number>).p95_ms;
      expect(prevP).toBeGreaterThanOrEqual(curP);
    }
  });

  it("defaults percentile to 95 and limit to 10, capped at 100", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getSlowServices(client, {}, TRACE_INDEX);
    expect(result.percentile).toBe(95);
    expect(result.services.length).toBeLessThanOrEqual(10);
  });
});

describe("getSlowEndpoints", () => {
  it("returns fixed avg_ms/p95_ms/p99_ms fields regardless of the chosen sort percentile", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getSlowEndpoints(
      client,
      { service: "PuntoVentaAPI", percentile: 50 },
      TRACE_INDEX,
    );
    expect(result.service).toBe("PuntoVentaAPI");
    expect(result.percentile).toBe(50);
    for (const endpoint of result.endpoints) {
      expect(endpoint).toHaveProperty("avg_ms");
      expect(endpoint).toHaveProperty("p95_ms");
      expect(endpoint).toHaveProperty("p99_ms");
      expect(endpoint).toHaveProperty("requests");
      expect(endpoint).toHaveProperty("transaction");
    }
  });

  it("excludes OPTIONS by default and includes them when include_options is true", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const withoutOptions = await getSlowEndpoints(client, { service: "PuntoVentaAPI" }, TRACE_INDEX);
    const withOptions = await getSlowEndpoints(
      client,
      { service: "PuntoVentaAPI", includeOptions: true },
      TRACE_INDEX,
    );
    const namesWithout = withoutOptions.endpoints.map((e) => e.transaction);
    const namesWith = withOptions.endpoints.map((e) => e.transaction);
    expect(namesWithout).not.toContain("OPTIONS DocumentosContables/GetDocumentoContableVista");
    expect(namesWith).toContain("OPTIONS DocumentosContables/GetDocumentoContableVista");
  });
});
