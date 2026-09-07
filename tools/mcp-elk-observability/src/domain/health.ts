import type { estypes } from "@elastic/elasticsearch";
import type { SearchClientLike } from "../elastic/search.js";
import { search } from "../elastic/search.js";
import { compileFilters, type QuerySpec } from "../elastic/query-builder.js";
import {
  buildDurationSubAggregations,
  buildServiceNameAggregation,
  buildTransactionNameAggregation,
} from "../elastic/aggregations.js";
import type { DurationStatsMs } from "../utils/time.js";
import {
  totalHits,
  capLimit,
  computeThroughputRpm,
  extractDurationStatsMs,
  percentileFieldName,
} from "./shared.js";
import { serviceNotFoundError, transactionNotFoundError } from "../utils/errors.js";

const DEFAULT_PERIOD = "1h";

const STATUS_CODE_RANGES = [
  { key: "2xx", from: 200, to: 300 },
  { key: "3xx", from: 300, to: 400 },
  { key: "4xx", from: 400, to: 500 },
  { key: "5xx", from: 500, to: 600 },
];

function buildHealthAggs(): Record<string, estypes.AggregationsAggregationContainer> {
  return {
    ...(buildDurationSubAggregations() as unknown as Record<
      string,
      estypes.AggregationsAggregationContainer
    >),
    status_codes: {
      range: { field: "http.response.status_code", ranges: STATUS_CODE_RANGES },
    },
    failures: { filter: { term: { "event.outcome": "failure" } } },
  };
}

interface StatusCodeBucket {
  key: string;
  doc_count: number;
}

interface HealthAggregationsResponse {
  status_codes?: { buckets?: StatusCodeBucket[] };
  failures?: { doc_count?: number };
}

export interface LatencySubset {
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
}

function toLatencySubset(stats: DurationStatsMs): LatencySubset {
  return { avg_ms: stats.avg_ms, p50_ms: stats.p50_ms, p95_ms: stats.p95_ms, p99_ms: stats.p99_ms, max_ms: stats.max_ms };
}

export interface CoreHealthMetrics {
  requests: number;
  throughput_rpm: number;
  latency: LatencySubset;
  errors: { count: number; rate_percent: number };
  status_codes: { "2xx": number; "3xx": number; "4xx": number; "5xx": number };
}

/**
 * Fetches and shapes the health metrics common to `get_service_health` and
 * `get_endpoint_health` (FR-3, FR-4). No healthy/degraded/critical
 * classification is computed anywhere in this function — only objective,
 * measured values (FR-22).
 */
async function fetchCoreHealth(
  client: SearchClientLike,
  spec: QuerySpec,
  traceIndex: string,
  period: string,
): Promise<CoreHealthMetrics> {
  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: buildHealthAggs(),
  });

  const requests = totalHits(response);
  const aggregations = (response.aggregations as unknown as HealthAggregationsResponse) ?? {};

  const latency = toLatencySubset(
    extractDurationStatsMs(response.aggregations as unknown as Record<string, unknown>),
  );

  const failureCount = aggregations.failures?.doc_count ?? 0;
  const rate_percent = requests > 0 ? (failureCount / requests) * 100 : 0;

  const statusBuckets = aggregations.status_codes?.buckets ?? [];
  const status_codes = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  for (const bucket of statusBuckets) {
    if (bucket.key in status_codes) {
      (status_codes as Record<string, number>)[bucket.key] = bucket.doc_count;
    }
  }

  return {
    requests,
    throughput_rpm: computeThroughputRpm(requests, period),
    latency,
    errors: { count: failureCount, rate_percent },
    status_codes,
  };
}

export interface GetServiceHealthParams {
  service: string;
  environment?: string;
  period?: string;
  includeOptions?: boolean;
}

export interface ServiceHealthResult extends CoreHealthMetrics {
  service: string;
  period: string;
}

/** Service-level health (FR-3): objective, measured values only — no health/status judgment. */
export async function getServiceHealth(
  client: SearchClientLike,
  params: GetServiceHealthParams,
  traceIndex: string,
): Promise<ServiceHealthResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const spec: QuerySpec = {
    service: params.service,
    environment: params.environment,
    processorEvent: "transaction",
    period,
    includeOptions: params.includeOptions ?? false,
  };

  const metrics = await fetchCoreHealth(client, spec, traceIndex, period);
  if (metrics.requests === 0) {
    throw serviceNotFoundError(params.service);
  }

  return { service: params.service, period, ...metrics };
}

export interface GetEndpointHealthParams {
  service: string;
  transaction: string;
  environment?: string;
  period?: string;
  includeOptions?: boolean;
}

export interface EndpointHealthResult extends CoreHealthMetrics {
  service: string;
  transaction: string;
  period: string;
}

/** Endpoint-level health (FR-4): same shape as `getServiceHealth`, plus `transaction`. */
export async function getEndpointHealth(
  client: SearchClientLike,
  params: GetEndpointHealthParams,
  traceIndex: string,
): Promise<EndpointHealthResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const spec: QuerySpec = {
    service: params.service,
    transactionName: params.transaction,
    environment: params.environment,
    processorEvent: "transaction",
    period,
    includeOptions: params.includeOptions ?? false,
  };

  const metrics = await fetchCoreHealth(client, spec, traceIndex, period);
  if (metrics.requests === 0) {
    throw transactionNotFoundError(params.service, params.transaction);
  }

  return { service: params.service, transaction: params.transaction, period, ...metrics };
}

const MAX_LIMIT = 100;
const DEFAULT_SLOW_LIMIT = 10;
const DEFAULT_PERCENTILE = 95;
/** Cardinality guard for the terms aggregation feeding client-side percentile sorting. */
const MAX_SCAN_SIZE = 100;

export interface GetSlowServicesParams {
  environment?: string;
  period?: string;
  limit?: number;
  percentile?: number;
}

export interface SlowServiceEntry {
  service: string;
  requests: number;
  avg_ms: number;
  [dynamicPercentileField: string]: string | number;
}

export interface SlowServicesResult {
  period: string;
  percentile: number;
  services: SlowServiceEntry[];
}

interface DurationBucket {
  key: string;
  doc_count: number;
  latency_avg?: { value: number | null };
  latency_max?: { value: number | null };
  latency_percentiles?: { values: Record<string, number | null> };
}

interface TermsAggregationResponse {
  buckets?: DurationBucket[];
}

const SERVICE_AGG_NAME = "by_service";

/**
 * Ranks services by the requested latency percentile, descending (FR-6).
 * OPTIONS requests are excluded unconditionally — no override parameter is
 * exposed for this service-level ranking tool.
 */
export async function getSlowServices(
  client: SearchClientLike,
  params: GetSlowServicesParams,
  traceIndex: string,
): Promise<SlowServicesResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const percentile = params.percentile ?? DEFAULT_PERCENTILE;
  const limit = capLimit(params.limit, MAX_LIMIT, DEFAULT_SLOW_LIMIT);

  const spec: QuerySpec = {
    environment: params.environment,
    processorEvent: "transaction",
    period,
  };

  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: {
      [SERVICE_AGG_NAME]: buildServiceNameAggregation({ size: MAX_SCAN_SIZE }),
    } as unknown as Record<string, estypes.AggregationsAggregationContainer>,
  });

  const buckets =
    (response.aggregations as unknown as Record<string, TermsAggregationResponse>)?.[
      SERVICE_AGG_NAME
    ]?.buckets ?? [];

  const fieldName = percentileFieldName(percentile);
  const services = buckets
    .map((bucket) => {
      const stats = extractDurationStatsMs(bucket as unknown as Record<string, unknown>);
      const entry: SlowServiceEntry = {
        service: bucket.key,
        requests: bucket.doc_count,
        avg_ms: stats.avg_ms,
      };
      entry[fieldName] = (stats as unknown as Record<string, number>)[fieldName] ?? 0;
      return entry;
    })
    .sort((a, b) => (b[fieldName] as number) - (a[fieldName] as number))
    .slice(0, limit);

  return { period, percentile, services };
}

export interface GetSlowEndpointsParams {
  service: string;
  environment?: string;
  period?: string;
  limit?: number;
  percentile?: number;
  includeOptions?: boolean;
}

export interface SlowEndpointEntry {
  transaction: string;
  requests: number;
  avg_ms: number;
  p95_ms: number;
  p99_ms: number;
}

export interface SlowEndpointsResult {
  service: string;
  period: string;
  percentile: number;
  endpoints: SlowEndpointEntry[];
}

const ENDPOINT_AGG_NAME = "by_transaction";

/**
 * Ranks endpoints within a service by the requested latency percentile,
 * descending (FR-7). Per specification.md, the response always surfaces the
 * fixed `avg_ms`/`p95_ms`/`p99_ms` fields regardless of which percentile was
 * chosen for sorting — `percentile` only controls ranking order, not which
 * fields are displayed. This is a literal, deliberate reading of the spec's
 * example response (unlike `get_slow_services`, whose displayed percentile
 * field is dynamic).
 */
export async function getSlowEndpoints(
  client: SearchClientLike,
  params: GetSlowEndpointsParams,
  traceIndex: string,
): Promise<SlowEndpointsResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const percentile = params.percentile ?? DEFAULT_PERCENTILE;
  const limit = capLimit(params.limit, MAX_LIMIT, DEFAULT_SLOW_LIMIT);

  const spec: QuerySpec = {
    service: params.service,
    environment: params.environment,
    processorEvent: "transaction",
    period,
    includeOptions: params.includeOptions ?? false,
  };

  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: {
      [ENDPOINT_AGG_NAME]: buildTransactionNameAggregation({ size: MAX_SCAN_SIZE }),
    } as unknown as Record<string, estypes.AggregationsAggregationContainer>,
  });

  const buckets =
    (response.aggregations as unknown as Record<string, TermsAggregationResponse>)?.[
      ENDPOINT_AGG_NAME
    ]?.buckets ?? [];

  const sortField = percentileFieldName(percentile);
  const endpoints = buckets
    .map((bucket) => {
      const stats = extractDurationStatsMs(bucket as unknown as Record<string, unknown>);
      return {
        transaction: bucket.key,
        requests: bucket.doc_count,
        avg_ms: stats.avg_ms,
        p95_ms: stats.p95_ms,
        p99_ms: stats.p99_ms,
        _sortValue: (stats as unknown as Record<string, number>)[sortField] ?? stats.avg_ms,
      };
    })
    .sort((a, b) => b._sortValue - a._sortValue)
    .slice(0, limit)
    .map(({ _sortValue, ...rest }) => rest);

  return { service: params.service, period, percentile, endpoints };
}
