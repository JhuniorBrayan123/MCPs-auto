import { describe, expect, it } from "vitest";
import { comparePeriodsSchema } from "./compare.js";

describe("comparePeriodsSchema", () => {
  it("requires service, current_period, and comparison_period", () => {
    expect(() => comparePeriodsSchema.parse({})).toThrow();
    expect(() => comparePeriodsSchema.parse({ service: "PuntoVentaAPI" })).toThrow();
    expect(() =>
      comparePeriodsSchema.parse({ service: "PuntoVentaAPI", current_period: "1h" }),
    ).toThrow();
  });

  it("accepts a full valid request with transaction omitted", () => {
    const result = comparePeriodsSchema.parse({
      service: "PuntoVentaAPI",
      current_period: "1h",
      comparison_period: "24h",
    });
    expect(result.transaction).toBeUndefined();
    expect(result.environment).toBeUndefined();
  });

  it("accepts an optional transaction filter", () => {
    const result = comparePeriodsSchema.parse({
      service: "PuntoVentaAPI",
      transaction: "GET /x",
      current_period: "1h",
      comparison_period: "24h",
    });
    expect(result.transaction).toBe("GET /x");
  });

  it("rejects invalid current_period/comparison_period expressions", () => {
    expect(() =>
      comparePeriodsSchema.parse({
        service: "PuntoVentaAPI",
        current_period: "1 hour",
        comparison_period: "24h",
      }),
    ).toThrow();
    expect(() =>
      comparePeriodsSchema.parse({
        service: "PuntoVentaAPI",
        current_period: "1h",
        comparison_period: "1h; DROP",
      }),
    ).toThrow();
  });
});
