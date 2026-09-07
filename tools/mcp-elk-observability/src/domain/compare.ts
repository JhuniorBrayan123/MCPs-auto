import type { estypes } from "@elastic/elasticsearch";
import type { SearchClientLike } from "../elastic/search.js";
import { search } from "../elastic/search.js";
import { compileFilters, type QuerySpec } from "../elastic/query-builder.js";
import { buildDurationSubAggregations } from "../elastic/aggregations.js";
import {
  totalHits,
  computeThroughputRpm,
  computeDiff,
  extractDurationStatsMs,
  type Diff,
} from "./shared.js";

export interface ComparePeriodsParams {
  service: string;
  transaction?: string;
  environment?: string;
  currentPeriod: string;
  comparisonPeriod: string;
}

interface RawPeriodMetrics {
  requests: number;
  throughput_rpm: number;
  avg_ms: number;
  p95_ms: number;
  p99_ms: number;
  error_rate: number;
}

interface FailuresAggregation {
  doc_count?: number;
}

/**
 * `compare_periods` deliberately does not throw `SERVICE_NOT_FOUND` /
 * `TRANSACTION_NOT_FOUND`: zero requests in either window is valid
 * comparison data (e.g. a just-launched service, or a transaction that
 * stopped appearing), not an error condition — unlike the health/latency
 * tools, this tool's entire purpose is to surface exactly that kind of
 * change.
 */
async function fetchPeriodMetrics(
  client: SearchClientLike,
  spec: QuerySpec,
  traceIndex: string,
  period: string,
): Promise<RawPeriodMetrics> {
  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: {
      ...(buildDurationSubAggregations() as unknown as Record<
        string,
        estypes.AggregationsAggregationContainer
      >),
      failures: { filter: { term: { "event.outcome": "failure" } } },
    },
  });

  const requests = totalHits(response);
  const stats = extractDurationStatsMs(response.aggregations as unknown as Record<string, unknown>);
  const failures = (response.aggregations as unknown as { failures?: FailuresAggregation })?.failures
    ?.doc_count ?? 0;
  const error_rate = requests > 0 ? (failures / requests) * 100 : 0;

  return {
    requests,
    throughput_rpm: computeThroughputRpm(requests, period),
    avg_ms: stats.avg_ms,
    p95_ms: stats.p95_ms,
    p99_ms: stats.p99_ms,
    error_rate,
  };
}

export interface MetricDiff extends Diff {
  current: number;
  comparison: number;
}

export interface ComparePeriodsResult {
  service: string;
  current_period: string;
  comparison_period: string;
  metrics: {
    requests: MetricDiff;
    throughput_rpm: MetricDiff;
    avg_ms: MetricDiff;
    p95_ms: MetricDiff;
    p99_ms: MetricDiff;
    error_rate: MetricDiff;
  };
}

function diffMetric(current: number, comparison: number): MetricDiff {
  return { current, comparison, ...computeDiff(current, comparison) };
}

/**
 * Compares `requests`, `throughput_rpm`, `avg_ms`, `p95_ms`, `p99_ms`, and
 * `error_rate` between two periods (FR-13), reporting both absolute and
 * percentage difference for each. `diff_percent` is `null` (never
 * `Infinity`/`NaN`) whenever the comparison value is `0`.
 */
export async function comparePeriods(
  client: SearchClientLike,
  params: ComparePeriodsParams,
  traceIndex: string,
): Promise<ComparePeriodsResult> {
  const baseSpec: QuerySpec = {
    service: params.service,
    transactionName: params.transaction,
    environment: params.environment,
    processorEvent: "transaction",
  };

  const [current, comparison] = await Promise.all([
    fetchPeriodMetrics(client, { ...baseSpec, period: params.currentPeriod }, traceIndex, params.currentPeriod),
    fetchPeriodMetrics(
      client,
      { ...baseSpec, period: params.comparisonPeriod },
      traceIndex,
      params.comparisonPeriod,
    ),
  ]);

  return {
    service: params.service,
    current_period: params.currentPeriod,
    comparison_period: params.comparisonPeriod,
    metrics: {
      requests: diffMetric(current.requests, comparison.requests),
      throughput_rpm: diffMetric(current.throughput_rpm, comparison.throughput_rpm),
      avg_ms: diffMetric(current.avg_ms, comparison.avg_ms),
      p95_ms: diffMetric(current.p95_ms, comparison.p95_ms),
      p99_ms: diffMetric(current.p99_ms, comparison.p99_ms),
      error_rate: diffMetric(current.error_rate, comparison.error_rate),
    },
  };
}
