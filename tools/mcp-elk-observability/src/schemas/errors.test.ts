import { describe, expect, it } from "vitest";
import { getServiceErrorsSchema, getEndpointErrorsSchema, getTopErrorsSchema } from "./errors.js";

describe("getServiceErrorsSchema", () => {
  it("requires service and defaults period to 1h", () => {
    expect(() => getServiceErrorsSchema.parse({})).toThrow();
    expect(getServiceErrorsSchema.parse({ service: "PuntoVentaAPI" }).period).toBe("1h");
  });
});

describe("getEndpointErrorsSchema", () => {
  it("requires service and transaction", () => {
    expect(() => getEndpointErrorsSchema.parse({ service: "PuntoVentaAPI" })).toThrow();
  });

  it("accepts both required fields", () => {
    const result = getEndpointErrorsSchema.parse({
      service: "PuntoVentaAPI",
      transaction: "GET /x",
    });
    expect(result.period).toBe("1h");
  });
});

describe("getTopErrorsSchema", () => {
  it("has no required fields (service is optional, aggregates across all services when omitted)", () => {
    const result = getTopErrorsSchema.parse({});
    expect(result.service).toBeUndefined();
    expect(result.limit).toBe(10);
    expect(result.period).toBe("1h");
  });

  it("clamps limit above 100", () => {
    expect(getTopErrorsSchema.parse({ limit: 1000 }).limit).toBe(100);
  });

  it("accepts an explicit service filter", () => {
    expect(getTopErrorsSchema.parse({ service: "PuntoVentaAPI" }).service).toBe("PuntoVentaAPI");
  });
});
