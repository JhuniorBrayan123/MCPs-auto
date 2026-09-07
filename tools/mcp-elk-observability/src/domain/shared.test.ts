import { describe, expect, it } from "vitest";
import {
  totalHits,
  capLimit,
  computeThroughputRpm,
  computeDiff,
  percentileFieldName,
  extractDurationStatsMs,
} from "./shared.js";

describe("totalHits", () => {
  it("reads hits.total.value from an object-shaped total", () => {
    expect(totalHits({ hits: { total: { value: 42 } } })).toBe(42);
  });

  it("reads hits.total directly when it is a plain number", () => {
    expect(totalHits({ hits: { total: 7 } })).toBe(7);
  });

  it("returns 0 when hits.total is missing", () => {
    expect(totalHits({ hits: {} })).toBe(0);
  });
});

describe("capLimit", () => {
  it("returns the requested limit when under the max", () => {
    expect(capLimit(10, 100)).toBe(10);
  });

  it("caps at the max when the requested limit exceeds it", () => {
    expect(capLimit(500, 100)).toBe(100);
  });

  it("falls back to the default when limit is undefined", () => {
    expect(capLimit(undefined, 100, 20)).toBe(20);
  });
});

describe("computeThroughputRpm", () => {
  it("computes requests per minute for a 1h period", () => {
    expect(computeThroughputRpm(3600, "1h")).toBe(60);
  });

  it("computes requests per minute for a 15m period", () => {
    expect(computeThroughputRpm(150, "15m")).toBe(10);
  });

  it("computes requests per minute for a 7d period", () => {
    expect(computeThroughputRpm(10080, "7d")).toBe(1);
  });
});

describe("computeDiff", () => {
  it("computes absolute and percentage diff for typical values", () => {
    const diff = computeDiff(145.2, 150.8);
    expect(diff.diff_absolute).toBeCloseTo(-5.6, 5);
    expect(diff.diff_percent).toBeCloseTo(-3.71, 1);
  });

  it("returns diff_percent as null (not Infinity/NaN) when comparison is 0", () => {
    const diff = computeDiff(118153, 0);
    expect(diff.diff_absolute).toBe(118153);
    expect(diff.diff_percent).toBeNull();
  });

  it("returns diff_absolute 0 and diff_percent 0 when current equals comparison (both nonzero)", () => {
    const diff = computeDiff(100, 100);
    expect(diff.diff_absolute).toBe(0);
    expect(diff.diff_percent).toBe(0);
  });
});

describe("percentileFieldName", () => {
  it("builds the p{N}_ms field name for a given percentile", () => {
    expect(percentileFieldName(95)).toBe("p95_ms");
    expect(percentileFieldName(50)).toBe("p50_ms");
  });
});

describe("extractDurationStatsMs", () => {
  it("extracts avg/max/percentiles from an ES aggregation response and converts to ms", () => {
    const aggregations = {
      latency_avg: { value: 145200 },
      latency_max: { value: 8450000 },
      latency_percentiles: {
        values: { "50.0": 98000, "75.0": 210000, "90.0": 410000, "95.0": 530000, "99.0": 1200000 },
      },
    };
    const stats = extractDurationStatsMs(aggregations, "latency");
    expect(stats.avg_ms).toBeCloseTo(145.2, 5);
    expect(stats.max_ms).toBeCloseTo(8450, 5);
    expect(stats.p95_ms).toBeCloseTo(530, 5);
  });

  it("defaults to zero when aggregations are missing", () => {
    const stats = extractDurationStatsMs(undefined, "latency");
    expect(stats.avg_ms).toBe(0);
    expect(stats.max_ms).toBe(0);
    expect(stats.p50_ms).toBe(0);
  });
});
