import { describe, expect, it } from "vitest";
import { listServicesSchema, listEndpointsSchema } from "./discovery.js";

describe("listServicesSchema", () => {
  it("accepts an empty input, defaulting period to 1h and leaving environment undefined", () => {
    const result = listServicesSchema.parse({});
    expect(result.period).toBe("1h");
    expect(result.environment).toBeUndefined();
  });

  it("accepts environment and a valid explicit period", () => {
    const result = listServicesSchema.parse({ environment: "produccion", period: "6h" });
    expect(result).toEqual({ environment: "produccion", period: "6h" });
  });

  it("rejects an invalid period", () => {
    expect(() => listServicesSchema.parse({ period: "1 hour" })).toThrow();
  });
});

describe("listEndpointsSchema", () => {
  it("requires service", () => {
    expect(() => listEndpointsSchema.parse({})).toThrow();
  });

  it("applies documented defaults: period 1h, limit 20, include_options false", () => {
    const result = listEndpointsSchema.parse({ service: "PuntoVentaAPI" });
    expect(result.period).toBe("1h");
    expect(result.limit).toBe(20);
    expect(result.include_options).toBe(false);
    expect(result.environment).toBeUndefined();
  });

  it("clamps limit above 100 to 100", () => {
    const result = listEndpointsSchema.parse({ service: "PuntoVentaAPI", limit: 999 });
    expect(result.limit).toBe(100);
  });

  it("accepts include_options: true", () => {
    const result = listEndpointsSchema.parse({ service: "PuntoVentaAPI", include_options: true });
    expect(result.include_options).toBe(true);
  });
});
