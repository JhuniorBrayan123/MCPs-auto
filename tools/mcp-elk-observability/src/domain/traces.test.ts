import { describe, expect, it } from "vitest";
import { traceRequest, getTraceDependencies } from "./traces.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import traceDocs from "../../test/fixtures/trace.json";
import { DomainError } from "../utils/errors.js";

const TRACE_INDEX = "traces-apm-default";
const TRACE_ID = "4f5dcb1a1b1bde0fdb9a130a85544498";

describe("traceRequest", () => {
  it("reconstructs the transaction + chronologically-ordered spans (FR-11)", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await traceRequest(client, { traceId: TRACE_ID }, TRACE_INDEX);

    expect(result.trace_id).toBe(TRACE_ID);
    expect(result.transaction).toEqual({
      service: "PuntoVentaAPI",
      name: "GET DocumentosContables/GetDocumentoContableVista",
      duration_ms: 145.2,
      status_code: 200,
    });

    expect(result.spans).toHaveLength(4);
    // Fixture array is deliberately shuffled; chronological order must be
    // span-mssql-1 (t+100ms), span-mssql-2 (t+200ms), span-redis-1 (t+300ms), span-http-1 (t+400ms).
    expect(result.spans.map((s) => s.name)).toEqual(["SAVE", "SELECT", "GET", "GET /api/x"]);
  });

  it("shapes the mssql span exactly per specification.md's sample", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await traceRequest(client, { traceId: TRACE_ID }, TRACE_INDEX);
    const mssqlSpan = result.spans.find((s) => s.name === "SAVE");
    expect(mssqlSpan).toEqual({
      type: "db",
      subtype: "mssql",
      name: "SAVE",
      duration_ms: 0.457,
      destination: "mssql-puntoventa.sreasons.internal",
      database: "SRPuntoVenta",
    });
  });

  it("handles a non-mssql span subtype without hardcoding (redis)", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await traceRequest(client, { traceId: TRACE_ID }, TRACE_INDEX);
    const redisSpan = result.spans.find((s) => s.subtype === "redis");
    expect(redisSpan?.type).toBe("db");
    expect(redisSpan?.destination).toBe("redis-cache.internal");
  });

  it("throws TRACE_NOT_FOUND when no documents match the trace_id", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    await expect(
      traceRequest(client, { traceId: "does-not-exist" }, TRACE_INDEX),
    ).rejects.toMatchObject({ code: "TRACE_NOT_FOUND" });
    await expect(
      traceRequest(client, { traceId: "does-not-exist" }, TRACE_INDEX),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("getTraceDependencies", () => {
  it("groups spans by (type, subtype, destination) and sums duration_ms per group", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await getTraceDependencies(client, { traceId: TRACE_ID }, TRACE_INDEX);

    expect(result.trace_duration_ms).toBe(145.2);
    const mssqlGroup = result.dependencies.find((d) => d.subtype === "mssql");
    expect(mssqlGroup).toBeDefined();
    expect(mssqlGroup?.calls).toBe(2);
    expect(mssqlGroup?.total_duration_ms).toBeCloseTo(3.657, 5);
    expect(mssqlGroup?.database).toBe("SRPuntoVenta");

    const redisGroup = result.dependencies.find((d) => d.subtype === "redis");
    expect(redisGroup?.calls).toBe(1);

    const httpGroup = result.dependencies.find((d) => d.subtype === "http");
    expect(httpGroup?.calls).toBe(1);
  });

  it("never clamps percentage_of_trace and always includes the caveat field", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await getTraceDependencies(client, { traceId: TRACE_ID }, TRACE_INDEX);
    expect(typeof result.caveat).toBe("string");
    expect(result.caveat.length).toBeGreaterThan(0);
    for (const dep of result.dependencies) {
      expect(typeof dep.percentage_of_trace).toBe("number");
    }
  });

  it("throws TRACE_NOT_FOUND when no documents match the trace_id", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    await expect(
      getTraceDependencies(client, { traceId: "does-not-exist" }, TRACE_INDEX),
    ).rejects.toMatchObject({ code: "TRACE_NOT_FOUND" });
  });

  it("returns percentage_of_trace as null (never Infinity/NaN) when no transaction doc is found for the trace", async () => {
    // Data anomaly: spans exist for this trace.id but no processor.event:"transaction"
    // document was found among them (e.g. transaction doc not yet indexed / sampled out).
    const orphanSpanOnly = [
      {
        processor: { event: "span" },
        service: { name: "PuntoVentaAPI" },
        "trace.id": "orphan-trace-1",
        trace: { id: "orphan-trace-1" },
        transaction: { id: "tx-1" },
        destination: { address: "mssql-puntoventa.sreasons.internal" },
        span: {
          duration: { us: 457 },
          subtype: "mssql",
          name: "SAVE",
          type: "db",
          db: { instance: "SRPuntoVenta" },
        },
        "@timestamp": "2026-01-01T00:00:00.100Z",
      },
    ];
    const client = fakeSearchClientFromDocs(orphanSpanOnly as Record<string, unknown>[]);
    const result = await getTraceDependencies(client, { traceId: "orphan-trace-1" }, TRACE_INDEX);

    expect(result.trace_duration_ms).toBe(0);
    expect(result.dependencies).toHaveLength(1);
    for (const dep of result.dependencies) {
      expect(dep.percentage_of_trace).toBeNull();
    }
  });
});
