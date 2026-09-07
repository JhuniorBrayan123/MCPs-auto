import { describe, expect, it } from "vitest";
import { traceRequestSchema, getTraceDependenciesSchema } from "./traces.js";

describe("traceRequestSchema", () => {
  it("requires trace_id", () => {
    expect(() => traceRequestSchema.parse({})).toThrow();
  });

  it("accepts a trace_id string", () => {
    expect(traceRequestSchema.parse({ trace_id: "abc123" }).trace_id).toBe("abc123");
  });
});

describe("getTraceDependenciesSchema", () => {
  it("requires trace_id", () => {
    expect(() => getTraceDependenciesSchema.parse({})).toThrow();
  });

  it("accepts a trace_id string", () => {
    expect(getTraceDependenciesSchema.parse({ trace_id: "abc123" }).trace_id).toBe("abc123");
  });
});
