import type { estypes } from "@elastic/elasticsearch";

/** Percentile points requested from every latency percentiles sub-aggregation. */
export const PERCENTS = [50, 75, 90, 95, 99] as const;

const DEFAULT_DURATION_FIELD = "transaction.duration.us";

export interface DurationSubAggregations {
  latency_percentiles: estypes.AggregationsAggregationContainer;
  latency_avg: estypes.AggregationsAggregationContainer;
  latency_max: estypes.AggregationsAggregationContainer;
}

/**
 * Builds the shared `percentiles` / `avg` / `max` sub-aggregation shapes
 * over a duration field (in microseconds, as stored by APM — conversion to
 * milliseconds happens later at the utils/time.ts response boundary, never
 * here).
 */
export function buildDurationSubAggregations(
  durationField: string = DEFAULT_DURATION_FIELD,
): DurationSubAggregations {
  return {
    latency_percentiles: {
      percentiles: { field: durationField, percents: [...PERCENTS] },
    },
    latency_avg: { avg: { field: durationField } },
    latency_max: { max: { field: durationField } },
  };
}

export interface KeyedAggregationOptions {
  size: number;
  durationField?: string;
}

export interface KeyedTermsAggregation {
  terms: estypes.AggregationsTermsAggregation;
  aggs: DurationSubAggregations;
}

/** `terms` aggregation keyed on `transaction.name`, with duration sub-aggregations. */
export function buildTransactionNameAggregation(
  options: KeyedAggregationOptions,
): KeyedTermsAggregation {
  return {
    terms: { field: "transaction.name", size: options.size },
    aggs: buildDurationSubAggregations(options.durationField),
  };
}

/** `terms` aggregation keyed on `service.name`, with duration sub-aggregations. */
export function buildServiceNameAggregation(
  options: KeyedAggregationOptions,
): KeyedTermsAggregation {
  return {
    terms: { field: "service.name", size: options.size },
    aggs: buildDurationSubAggregations(options.durationField),
  };
}
