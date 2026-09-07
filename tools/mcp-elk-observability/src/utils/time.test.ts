import { describe, expect, it } from "vitest";
import { usToMs, buildDurationStatsMs } from "./time.js";

describe("usToMs", () => {
  it("converts whole microseconds to milliseconds", () => {
    expect(usToMs(1000)).toBe(1);
    expect(usToMs(145200)).toBe(145.2);
  });

  it("converts fractional-microsecond edge cases from sample docs", () => {
    expect(usToMs(457)).toBe(0.457);
  });

  it("converts zero to zero", () => {
    expect(usToMs(0)).toBe(0);
  });

  it("converts large durations (7d-scale aggregations) without precision loss beyond float", () => {
    expect(usToMs(8450000)).toBe(8450);
  });
});

describe("buildDurationStatsMs", () => {
  it("builds an object with every value under an explicit _ms-suffixed key, converted from microseconds", () => {
    const result = buildDurationStatsMs({
      avg: 145200,
      max: 8450000,
      percentiles: { p50: 98000, p75: 210000, p90: 410000, p95: 530000, p99: 1200000 },
    });

    expect(result).toEqual({
      avg_ms: 145.2,
      p50_ms: 98,
      p75_ms: 210,
      p90_ms: 410,
      p95_ms: 530,
      p99_ms: 1200,
      max_ms: 8450,
    });
  });

  it("handles the fractional mssql span sample (457us avg -> 0.457ms)", () => {
    const result = buildDurationStatsMs({
      avg: 457,
      max: 457,
      percentiles: { p50: 457, p75: 457, p90: 457, p95: 457, p99: 457 },
    });

    expect(result.avg_ms).toBe(0.457);
    expect(result.max_ms).toBe(0.457);
  });

  it("only ever exposes converted values under keys ending in _ms", () => {
    const result = buildDurationStatsMs({
      avg: 1000,
      max: 2000,
      percentiles: { p50: 100, p75: 200, p90: 300, p95: 400, p99: 500 },
    });

    for (const key of Object.keys(result)) {
      expect(key.endsWith("_ms")).toBe(true);
    }
  });
});
