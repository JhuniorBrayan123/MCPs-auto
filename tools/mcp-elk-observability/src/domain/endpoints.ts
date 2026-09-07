import type { estypes } from "@elastic/elasticsearch";
import type { SearchClientLike } from "../elastic/search.js";
import { search } from "../elastic/search.js";
import { compileFilters, type QuerySpec } from "../elastic/query-builder.js";
import {
  buildTransactionNameAggregation,
  buildDurationSubAggregations,
} from "../elastic/aggregations.js";
import { totalHits, capLimit, extractDurationStatsMs } from "./shared.js";
import { transactionNotFoundError } from "../utils/errors.js";

const DEFAULT_PERIOD = "1h";
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIMIT = 100;
const AGG_NAME = "by_transaction";

export interface ListEndpointsParams {
  service: string;
  environment?: string;
  period?: string;
  limit?: number;
  includeOptions?: boolean;
}

export interface EndpointSummary {
  transaction: string;
  method: string | undefined;
  sample_path: string | undefined;
  requests: number;
}

export interface ListEndpointsResult {
  service: string;
  endpoints: EndpointSummary[];
}

interface SampleHit {
  _source: { http?: { request?: { method?: string } }; url?: { path?: string } };
}

interface TransactionBucket {
  key: string;
  doc_count: number;
  sample?: { hits?: { hits?: SampleHit[] } };
}

interface TransactionTermsAggregation {
  buckets: TransactionBucket[];
}

/**
 * Groups transactions by `transaction.name` (never `url.path`) as the
 * primary key (FR-2). `method` is read from `http.request.method` via a
 * one-document `top_hits` sample per bucket, never parsed out of the
 * transaction name — so verb-less names (e.g. `ProcesarDescargoFacturacionV2`)
 * are handled without any special casing.
 */
export async function listEndpoints(
  client: SearchClientLike,
  params: ListEndpointsParams,
  traceIndex: string,
): Promise<ListEndpointsResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const size = capLimit(params.limit, MAX_LIMIT, DEFAULT_LIST_LIMIT);

  const spec: QuerySpec = {
    service: params.service,
    environment: params.environment,
    processorEvent: "transaction",
    period,
    includeOptions: params.includeOptions ?? false,
  };

  const base = buildTransactionNameAggregation({ size });
  const byTransaction = {
    terms: base.terms,
    aggs: {
      ...base.aggs,
      sample: { top_hits: { size: 1, _source: ["http.request.method", "url.path"] } },
    },
  };

  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: { [AGG_NAME]: byTransaction } as Record<string, estypes.AggregationsAggregationContainer>,
  });

  const aggregation = (
    response.aggregations as unknown as Record<string, TransactionTermsAggregation>
  )?.[AGG_NAME];
  const buckets = aggregation?.buckets ?? [];

  const endpoints = buckets.map((bucket) => {
    const sampleSource = bucket.sample?.hits?.hits?.[0]?._source;
    return {
      transaction: bucket.key,
      method: sampleSource?.http?.request?.method,
      sample_path: sampleSource?.url?.path,
      requests: bucket.doc_count,
    };
  });

  return { service: params.service, endpoints };
}

export interface GetEndpointLatencyParams {
  service: string;
  transaction: string;
  environment?: string;
  period?: string;
}

export interface EndpointLatencyResult {
  service: string;
  transaction: string;
  period: string;
  requests: number;
  avg_ms: number;
  p50_ms: number;
  p75_ms: number;
  p90_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
}

/** Endpoint-level latency percentiles (FR-5) — full percentile set, always in `_ms` fields. */
export async function getEndpointLatency(
  client: SearchClientLike,
  params: GetEndpointLatencyParams,
  traceIndex: string,
): Promise<EndpointLatencyResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const spec: QuerySpec = {
    service: params.service,
    transactionName: params.transaction,
    environment: params.environment,
    processorEvent: "transaction",
    period,
  };

  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: buildDurationSubAggregations() as unknown as Record<
      string,
      estypes.AggregationsAggregationContainer
    >,
  });

  const requests = totalHits(response);
  if (requests === 0) {
    throw transactionNotFoundError(params.service, params.transaction);
  }

  const stats = extractDurationStatsMs(
    response.aggregations as unknown as Record<string, unknown>,
  );

  return {
    service: params.service,
    transaction: params.transaction,
    period,
    requests,
    ...stats,
  };
}
