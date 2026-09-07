import { describe, expect, it } from "vitest";
import {
  getFirstDefined,
  ERROR_GROUPING_CANDIDATES,
  getServiceErrors,
  getEndpointErrors,
  getTopErrors,
} from "./errors.js";
import { fakeSearchClientFromDocs, routedSearchClient } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";
import errorDocs from "../../test/fixtures/errors.json";
import { DomainError } from "../utils/errors.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";

describe("getFirstDefined", () => {
  it("returns the value at the first candidate path present on the document", () => {
    const doc = { error: { grouping_key: "grp-1", exception: { type: "SqlException" } } };
    expect(getFirstDefined(doc, ERROR_GROUPING_CANDIDATES)).toBe("grp-1");
  });

  it("falls through to the next candidate path when the first is absent (tolerant cascade)", () => {
    const doc = { error: { exception: { type: "NullReferenceException" } } };
    expect(getFirstDefined(doc, ERROR_GROUPING_CANDIDATES)).toBe("NullReferenceException");
  });

  it("returns undefined when no candidate path resolves", () => {
    const doc = { error: { log: { message: "no structured fields" } } };
    expect(getFirstDefined(doc, ERROR_GROUPING_CANDIDATES)).toBeUndefined();
  });
});

describe("getServiceErrors", () => {
  it("reports http_4xx/http_5xx/event_outcome/apm_errors as independent fields (FR-8)", async () => {
    const client = routedSearchClient({
      [TRACE_INDEX]: fakeSearchClientFromDocs(transactions as Record<string, unknown>[]),
      [ERROR_INDEX]: fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]),
    });
    const result = await getServiceErrors(client, { service: "PuntoVentaAPI" }, TRACE_INDEX, ERROR_INDEX);

    expect(result.service).toBe("PuntoVentaAPI");
    expect(typeof result.http_4xx).toBe("number");
    expect(typeof result.http_5xx).toBe("number");
    expect(result.event_outcome).toEqual(
      expect.objectContaining({
        success: expect.any(Number),
        failure: expect.any(Number),
        unknown: expect.any(Number),
      }),
    );
    expect(typeof result.apm_errors).toBe("number");
    expect(result.http_5xx).toBeGreaterThanOrEqual(1);
  });

  it("throws SERVICE_NOT_FOUND for a nonexistent service", async () => {
    const client = routedSearchClient({
      [TRACE_INDEX]: fakeSearchClientFromDocs(transactions as Record<string, unknown>[]),
      [ERROR_INDEX]: fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]),
    });
    await expect(
      getServiceErrors(client, { service: "Typo123" }, TRACE_INDEX, ERROR_INDEX),
    ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
  });
});

describe("getEndpointErrors", () => {
  it("returns requests/failed_requests/error_rate/4xx/5xx/top_errors", async () => {
    const client = routedSearchClient({
      [TRACE_INDEX]: fakeSearchClientFromDocs(transactions as Record<string, unknown>[]),
      [ERROR_INDEX]: fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]),
    });
    const result = await getEndpointErrors(
      client,
      {
        service: "PuntoVentaAPI",
        transaction: "GET DocumentosContables/GetDocumentoContableVista",
      },
      TRACE_INDEX,
      ERROR_INDEX,
    );

    expect(result.service).toBe("PuntoVentaAPI");
    expect(result.transaction).toBe("GET DocumentosContables/GetDocumentoContableVista");
    expect(typeof result.requests).toBe("number");
    expect(typeof result.failed_requests).toBe("number");
    expect(typeof result.error_rate).toBe("number");
    expect(Array.isArray(result.top_errors)).toBe(true);
    if (result.top_errors.length > 0) {
      expect(result.top_errors[0]).toHaveProperty("key");
      expect(result.top_errors[0]).toHaveProperty("count");
    }
  });

  it("throws TRANSACTION_NOT_FOUND when the transaction does not exist", async () => {
    const client = routedSearchClient({
      [TRACE_INDEX]: fakeSearchClientFromDocs(transactions as Record<string, unknown>[]),
      [ERROR_INDEX]: fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]),
    });
    await expect(
      getEndpointErrors(
        client,
        { service: "PuntoVentaAPI", transaction: "Nope" },
        TRACE_INDEX,
        ERROR_INDEX,
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("getTopErrors", () => {
  it("groups via the tolerant candidate-path cascade and reports grouping_field_used", async () => {
    const client = fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]);
    const result = await getTopErrors(client, {}, ERROR_INDEX);

    expect(result.errors.length).toBeGreaterThan(0);
    const groupingKeyGroup = result.errors.find((e) => e.key === "grp-sqlexception-001");
    expect(groupingKeyGroup?.grouping_field_used).toBe("error.grouping_key");
    expect(groupingKeyGroup?.count).toBe(2);

    const fallbackGroup = result.errors.find((e) => e.key === "System.NullReferenceException");
    expect(fallbackGroup?.grouping_field_used).toBe("error.exception.type");
  });

  it("orders errors by count descending and caps at limit", async () => {
    const client = fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]);
    const result = await getTopErrors(client, { limit: 1 }, ERROR_INDEX);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.count).toBe(2);
  });

  it("filters by service when provided", async () => {
    const client = fakeSearchClientFromDocs(errorDocs as Record<string, unknown>[]);
    const result = await getTopErrors(client, { service: "FinanzasAPI" }, ERROR_INDEX);
    expect(result.errors.every((e) => e.service === "FinanzasAPI")).toBe(true);
  });
});
