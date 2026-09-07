import { describe, expect, it } from "vitest";
import {
  getServiceHealthSchema,
  getEndpointHealthSchema,
  getEndpointLatencySchema,
  getSlowServicesSchema,
  getSlowEndpointsSchema,
} from "./health.js";

describe("getServiceHealthSchema", () => {
  it("requires service", () => {
    expect(() => getServiceHealthSchema.parse({})).toThrow();
  });

  it("defaults period to 1h and include_options to false", () => {
    const result = getServiceHealthSchema.parse({ service: "PuntoVentaAPI" });
    expect(result.period).toBe("1h");
    expect(result.include_options).toBe(false);
  });
});

describe("getEndpointHealthSchema", () => {
  it("requires service and transaction", () => {
    expect(() => getEndpointHealthSchema.parse({ service: "PuntoVentaAPI" })).toThrow();
    expect(() => getEndpointHealthSchema.parse({ transaction: "GET /x" })).toThrow();
  });

  it("accepts both required fields with documented defaults", () => {
    const result = getEndpointHealthSchema.parse({
      service: "PuntoVentaAPI",
      transaction: "GET DocumentosContables/GetDocumentoContableVista",
    });
    expect(result.period).toBe("1h");
    expect(result.include_options).toBe(false);
  });
});

describe("getEndpointLatencySchema", () => {
  it("requires service and transaction, has no limit/percentile fields", () => {
    expect(() =>
      getEndpointLatencySchema.parse({ service: "PuntoVentaAPI" }),
    ).toThrow();
    const result = getEndpointLatencySchema.parse({
      service: "PuntoVentaAPI",
      transaction: "GET /x",
    });
    expect(result.period).toBe("1h");
    expect(result).not.toHaveProperty("limit");
  });
});

describe("getSlowServicesSchema", () => {
  it("has no required fields and defaults limit=10, percentile=95", () => {
    const result = getSlowServicesSchema.parse({});
    expect(result.limit).toBe(10);
    expect(result.percentile).toBe(95);
    expect(result.period).toBe("1h");
  });

  it("clamps limit above 100", () => {
    expect(getSlowServicesSchema.parse({ limit: 250 }).limit).toBe(100);
  });

  it("rejects an out-of-enum percentile", () => {
    expect(() => getSlowServicesSchema.parse({ percentile: 42 })).toThrow();
  });
});

describe("getSlowEndpointsSchema", () => {
  it("requires service and defaults limit=10, percentile=95, include_options=false", () => {
    expect(() => getSlowEndpointsSchema.parse({})).toThrow();
    const result = getSlowEndpointsSchema.parse({ service: "FinanzasAPI" });
    expect(result.limit).toBe(10);
    expect(result.percentile).toBe(95);
    expect(result.include_options).toBe(false);
  });
});
