/**
 * Converts a duration stored in microseconds (as APM stores
 * `transaction.duration.us` / `span.duration.us`) into milliseconds.
 *
 * This is the single, shared conversion point (FR-16): no other module ever
 * divides a duration by 1000 ad hoc, and every value produced here is only
 * ever placed under an explicitly `_ms`-suffixed field name by callers.
 */
export function usToMs(valueUs: number): number {
  return valueUs / 1000;
}

export interface PercentileValuesUs {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

/** Raw avg/max/percentiles duration statistics, in microseconds, as read from an ES aggregation response. */
export interface DurationStatsUs {
  avg: number;
  max: number;
  percentiles: PercentileValuesUs;
}

/** The same statistics, converted to milliseconds, every key explicitly `_ms`-suffixed. */
export interface DurationStatsMs {
  avg_ms: number;
  p50_ms: number;
  p75_ms: number;
  p90_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
}

/**
 * Builds the shared `{avg_ms, p50_ms, p75_ms, p90_ms, p95_ms, p99_ms,
 * max_ms}` shape from raw microsecond aggregation results. This is the only
 * place callers should go from raw ES duration numbers to response-ready
 * millisecond fields.
 */
export function buildDurationStatsMs(stats: DurationStatsUs): DurationStatsMs {
  return {
    avg_ms: usToMs(stats.avg),
    p50_ms: usToMs(stats.percentiles.p50),
    p75_ms: usToMs(stats.percentiles.p75),
    p90_ms: usToMs(stats.percentiles.p90),
    p95_ms: usToMs(stats.percentiles.p95),
    p99_ms: usToMs(stats.percentiles.p99),
    max_ms: usToMs(stats.max),
  };
}
