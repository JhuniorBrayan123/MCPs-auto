import { describe, expect, it } from "vitest";
import { VALID_PERIODS } from "../elastic/period-parser.js";
import {
  environmentParam,
  includeOptionsParam,
  limitParam,
  percentileParam,
  periodParam,
  periodSchema,
  serviceParam,
  optionalServiceParam,
  traceIdParam,
  transactionParam,
} from "./shared.js";
import { z } from "zod";

describe("periodSchema", () => {
  it.each(VALID_PERIODS)("accepts valid period %s", (period) => {
    expect(periodSchema.parse(period)).toBe(period);
  });

  it("rejects an invalid period expression", () => {
    expect(() => periodSchema.parse("1 hour")).toThrow();
    expect(() => periodSchema.parse("1h; DROP")).toThrow();
    expect(() => periodSchema.parse("")).toThrow();
  });
});

describe("periodParam", () => {
  const schema = z.object({ period: periodParam() });

  it("defaults to 1h when omitted", () => {
    expect(schema.parse({}).period).toBe("1h");
  });

  it("accepts an explicit valid period", () => {
    expect(schema.parse({ period: "24h" }).period).toBe("24h");
  });

  it("rejects an invalid period", () => {
    expect(() => schema.parse({ period: "1 hour" })).toThrow();
  });
});

describe("environmentParam", () => {
  const schema = z.object({ environment: environmentParam });

  it("is undefined when omitted (never defaulted, FR-14)", () => {
    const result = schema.parse({});
    expect(result.environment).toBeUndefined();
  });

  it("passes through any free-form string", () => {
    expect(schema.parse({ environment: "produccion" }).environment).toBe("produccion");
  });
});

describe("includeOptionsParam", () => {
  const schema = z.object({ include_options: includeOptionsParam });

  it("defaults to false when omitted", () => {
    expect(schema.parse({}).include_options).toBe(false);
  });

  it("accepts an explicit true", () => {
    expect(schema.parse({ include_options: true }).include_options).toBe(true);
  });
});

describe("percentileParam", () => {
  const schema = z.object({ percentile: percentileParam() });

  it("defaults to 95 when omitted", () => {
    expect(schema.parse({}).percentile).toBe(95);
  });

  it.each([50, 75, 90, 95, 99])("accepts valid percentile %d", (p) => {
    expect(schema.parse({ percentile: p }).percentile).toBe(p);
  });

  it("rejects a percentile outside the enum", () => {
    expect(() => schema.parse({ percentile: 60 })).toThrow();
    expect(() => schema.parse({ percentile: 100 })).toThrow();
  });
});

describe("limitParam", () => {
  const schema = z.object({ limit: limitParam(20) });

  it("defaults to the tool-specific default when omitted", () => {
    expect(schema.parse({}).limit).toBe(20);
  });

  it("passes through a value within bounds", () => {
    expect(schema.parse({ limit: 5 }).limit).toBe(5);
  });

  it("clamps a value above 100 down to 100 rather than rejecting it", () => {
    expect(schema.parse({ limit: 500 }).limit).toBe(100);
  });

  it("clamps a value exactly at 100 to 100", () => {
    expect(schema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejects a negative limit", () => {
    expect(() => schema.parse({ limit: -1 })).toThrow();
  });

  it("rejects a non-integer limit", () => {
    expect(() => schema.parse({ limit: 5.5 })).toThrow();
  });
});

describe("required string params", () => {
  it("serviceParam rejects missing value", () => {
    const schema = z.object({ service: serviceParam });
    expect(() => schema.parse({})).toThrow();
  });

  it("optionalServiceParam allows a missing value", () => {
    const schema = z.object({ service: optionalServiceParam });
    expect(schema.parse({}).service).toBeUndefined();
  });

  it("transactionParam rejects missing value", () => {
    const schema = z.object({ transaction: transactionParam });
    expect(() => schema.parse({})).toThrow();
  });

  it("traceIdParam rejects missing value", () => {
    const schema = z.object({ trace_id: traceIdParam });
    expect(() => schema.parse({})).toThrow();
  });
});
