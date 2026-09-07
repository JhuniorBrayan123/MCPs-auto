import { describe, expect, it } from "vitest";
import {
  serviceNameFilter,
  environmentFilter,
  processorEventFilter,
  transactionNameFilter,
  httpMethodFilter,
  timestampRangeFilter,
  traceIdFilter,
  optionsExclusionFilter,
} from "./filters.js";

describe("serviceNameFilter", () => {
  it("emits a term clause on service.name when service is present", () => {
    expect(serviceNameFilter({ service: "PuntoVentaAPI" })).toEqual({
      term: { "service.name": "PuntoVentaAPI" },
    });
  });

  it("emits no clause when service is absent", () => {
    expect(serviceNameFilter({})).toBeUndefined();
  });
});

describe("environmentFilter", () => {
  it("emits a term clause on service.environment when environment is present", () => {
    expect(environmentFilter({ environment: "produccion" })).toEqual({
      term: { "service.environment": "produccion" },
    });
  });

  it("emits no clause when environment is absent", () => {
    expect(environmentFilter({})).toBeUndefined();
  });
});

describe("processorEventFilter", () => {
  it("emits a term clause on processor.event when processorEvent is present", () => {
    expect(processorEventFilter({ processorEvent: "transaction" })).toEqual({
      term: { "processor.event": "transaction" },
    });
  });

  it("emits no clause when processorEvent is absent", () => {
    expect(processorEventFilter({})).toBeUndefined();
  });
});

describe("transactionNameFilter", () => {
  it("emits a term clause on transaction.name when transactionName is present", () => {
    expect(
      transactionNameFilter({ transactionName: "ProcesarDescargoFacturacionV2" }),
    ).toEqual({
      term: { "transaction.name": "ProcesarDescargoFacturacionV2" },
    });
  });

  it("emits no clause when transactionName is absent", () => {
    expect(transactionNameFilter({})).toBeUndefined();
  });
});

describe("httpMethodFilter", () => {
  it("emits a term clause on http.request.method when httpMethod is present", () => {
    expect(httpMethodFilter({ httpMethod: "GET" })).toEqual({
      term: { "http.request.method": "GET" },
    });
  });

  it("emits no clause when httpMethod is absent", () => {
    expect(httpMethodFilter({})).toBeUndefined();
  });
});

describe("timestampRangeFilter", () => {
  it("emits a range clause on @timestamp when period is present", () => {
    expect(timestampRangeFilter({ period: "1h" })).toEqual({
      range: { "@timestamp": { gte: "now-1h", lte: "now" } },
    });
  });

  it("emits no clause when period is absent", () => {
    expect(timestampRangeFilter({})).toBeUndefined();
  });
});

describe("traceIdFilter", () => {
  it("emits a term clause on trace.id when traceId is present", () => {
    expect(traceIdFilter({ traceId: "4f5dcb1a1b1bde0fdb9a130a85544498" })).toEqual({
      term: { "trace.id": "4f5dcb1a1b1bde0fdb9a130a85544498" },
    });
  });

  it("emits no clause when traceId is absent", () => {
    expect(traceIdFilter({})).toBeUndefined();
  });
});

describe("optionsExclusionFilter", () => {
  it("emits a must_not OPTIONS clause when includeOptions is absent (default false)", () => {
    expect(optionsExclusionFilter({})).toEqual({
      bool: {
        must_not: [
          { term: { "http.request.method": { value: "OPTIONS", case_insensitive: true } } },
        ],
      },
    });
  });

  it("emits a must_not OPTIONS clause when includeOptions is explicitly false", () => {
    expect(optionsExclusionFilter({ includeOptions: false })).toEqual({
      bool: {
        must_not: [
          { term: { "http.request.method": { value: "OPTIONS", case_insensitive: true } } },
        ],
      },
    });
  });

  it("emits no clause when includeOptions is true", () => {
    expect(optionsExclusionFilter({ includeOptions: true })).toBeUndefined();
  });
});
