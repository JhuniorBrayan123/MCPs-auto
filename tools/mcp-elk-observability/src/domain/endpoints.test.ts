import { describe, expect, it } from "vitest";
import { listEndpoints, getEndpointLatency } from "./endpoints.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import { DomainError } from "../utils/errors.js";

const TRACE_INDEX = "traces-apm-default";

describe("listEndpoints", () => {
  it("groups by transaction.name, not url.path, and excludes OPTIONS by default", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listEndpoints(client, { service: "PuntoVentaAPI" }, TRACE_INDEX);

    expect(result.service).toBe("PuntoVentaAPI");
    const names = result.endpoints.map((e) => e.transaction);
    expect(names).not.toContain("OPTIONS DocumentosContables/GetDocumentoContableVista");
    expect(names).toContain("GET DocumentosContables/GetDocumentoContableVista");
  });

  it("includes OPTIONS transactions when include_options is true", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listEndpoints(
      client,
      { service: "PuntoVentaAPI", includeOptions: true },
      TRACE_INDEX,
    );
    const names = result.endpoints.map((e) => e.transaction);
    expect(names).toContain("OPTIONS DocumentosContables/GetDocumentoContableVista");
  });

  it("handles a verb-less transaction.name without error (FR-2)", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listEndpoints(client, { service: "FinanzasAPI" }, TRACE_INDEX);
    const endpoint = result.endpoints.find((e) => e.transaction === "ProcesarDescargoFacturacionV2");
    expect(endpoint).toBeDefined();
    expect(endpoint?.method).toBe("POST");
  });

  it("reads method from http.request.method, never parsed from transaction.name", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listEndpoints(client, { service: "PuntoVentaAPI" }, TRACE_INDEX);
    const endpoint = result.endpoints.find(
      (e) => e.transaction === "GET DocumentosContables/GetDocumentoContableVista",
    );
    expect(endpoint?.method).toBe("GET");
    expect(endpoint?.sample_path).toBe("/PuntoVenta/api/DocumentosContables/Vista");
  });

  it("caps limit at 100 and defaults to 20", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listEndpoints(client, { service: "PuntoVentaAPI", limit: 500 }, TRACE_INDEX);
    expect(result.endpoints.length).toBeLessThanOrEqual(100);
  });
});

describe("getEndpointLatency", () => {
  it("returns the full percentile set (avg,p50,p75,p90,p95,p99,max) in ms", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await getEndpointLatency(
      client,
      { service: "PuntoVentaAPI", transaction: "GET DocumentosContables/GetDocumentoContableVista" },
      TRACE_INDEX,
    );

    expect(result.service).toBe("PuntoVentaAPI");
    expect(result.transaction).toBe("GET DocumentosContables/GetDocumentoContableVista");
    // Two fixture docs share this service+transaction (tx-normal: 145200us, tx-failure: 8450000us).
    expect(result.requests).toBe(2);
    expect(result.max_ms).toBeCloseTo(8450, 5);
    expect(result.p50_ms).toBeGreaterThanOrEqual(0);
  });

  it("throws TRANSACTION_NOT_FOUND when service exists but transaction does not", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(
      getEndpointLatency(
        client,
        { service: "PuntoVentaAPI", transaction: "NoSuchTransaction" },
        TRACE_INDEX,
      ),
    ).rejects.toMatchObject({ code: "TRANSACTION_NOT_FOUND" });
  });

  it("rejects with a DomainError instance on not-found", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    await expect(
      getEndpointLatency(client, { service: "PuntoVentaAPI", transaction: "Nope" }, TRACE_INDEX),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
