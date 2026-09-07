import { VALID_PERIODS, type ValidPeriod } from "../elastic/period-parser.js";
import { buildDurationStatsMs, type DurationStatsMs } from "../utils/time.js";

/**
 * Small, cross-cutting pure helpers shared by the domain modules
 * (services/endpoints/health/compare). This file does not itself power any
 * of the 13 tools — it exists only to avoid duplicating a handful of tiny
 * numeric helpers across those modules.
 */

/** Reads `hits.total` from a search response, tolerating both the modern
 * `{value, relation}` object shape and the legacy plain-number shape. */
export function totalHits(response: { hits?: { total?: unknown } }): number {
  const total = response.hits?.total;
  if (typeof total === "number") {
    return total;
  }
  if (total !== null && typeof total === "object" && "value" in total) {
    return (total as { value: number }).value;
  }
  return 0;
}

/** Caps a caller-requested limit at `max` (FR-20), falling back to `defaultValue` when omitted. */
export function capLimit(limit: number | undefined, max: number, defaultValue: number = max): number {
  const requested = limit ?? defaultValue;
  return Math.min(requested, max);
}

const PERIOD_MINUTES: Record<ValidPeriod, number> = {
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "6h": 360,
  "12h": 720,
  "24h": 1440,
  "7d": 10080,
};

function periodToMinutes(period: string): number {
  if ((VALID_PERIODS as readonly string[]).includes(period)) {
    return PERIOD_MINUTES[period as ValidPeriod];
  }
  // Defensive fallback: period-parser.ts is the single source of truth for
  // validation and would already have rejected an invalid period before it
  // reaches domain code. This branch only guards against a caller bypassing
  // that validation.
  return PERIOD_MINUTES["1h"];
}

/** Converts a request count over a period window into requests-per-minute. */
export function computeThroughputRpm(requests: number, period: string): number {
  return requests / periodToMinutes(period);
}

export interface Diff {
  diff_absolute: number;
  diff_percent: number | null;
}

/**
 * `diff_absolute = current - comparison`; `diff_percent = diff_absolute /
 * comparison * 100`, reported as `null` (never `Infinity`/`NaN`) when
 * `comparison` is `0`, per specification.md `compare_periods`.
 */
export function computeDiff(current: number, comparison: number): Diff {
  const diff_absolute = current - comparison;
  const diff_percent = comparison === 0 ? null : (diff_absolute / comparison) * 100;
  return { diff_absolute, diff_percent };
}

/** Builds the dynamic `p{percentile}_ms` field name used by the slow-ranking tools. */
export function percentileFieldName(percentile: number): string {
  return `p${percentile}_ms`;
}

interface AvgMaxAggregation {
  value: number | null;
}

interface PercentilesAggregation {
  values: Record<string, number | null>;
}

/**
 * Reads the `{prefix}_avg` / `{prefix}_max` / `{prefix}_percentiles`
 * sub-aggregations produced by `elastic/aggregations.ts`'s
 * `buildDurationSubAggregations()` (whose fixed key names are
 * `latency_avg`/`latency_max`/`latency_percentiles`) out of an ES
 * aggregation response — either the top-level `response.aggregations` for a
 * flat query, or a single terms-aggregation bucket — and converts them to
 * the shared `_ms`-suffixed shape (FR-16). Missing sub-aggregations default
 * to `0` rather than throwing, since a zero-match bucket/response is a
 * legitimate (if unusual) input here.
 */
export function extractDurationStatsMs(
  aggregations: Record<string, unknown> | undefined,
  prefix = "latency",
): DurationStatsMs {
  const metrics = (aggregations ?? {}) as Record<
    string,
    AvgMaxAggregation | PercentilesAggregation | undefined
  >;
  const avgAgg = metrics[`${prefix}_avg`] as AvgMaxAggregation | undefined;
  const maxAgg = metrics[`${prefix}_max`] as AvgMaxAggregation | undefined;
  const percentilesAgg = metrics[`${prefix}_percentiles`] as PercentilesAggregation | undefined;
  const values = percentilesAgg?.values ?? {};

  return buildDurationStatsMs({
    avg: avgAgg?.value ?? 0,
    max: maxAgg?.value ?? 0,
    percentiles: {
      p50: values["50.0"] ?? 0,
      p75: values["75.0"] ?? 0,
      p90: values["90.0"] ?? 0,
      p95: values["95.0"] ?? 0,
      p99: values["99.0"] ?? 0,
    },
  });
}
