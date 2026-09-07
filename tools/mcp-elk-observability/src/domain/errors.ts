import type { estypes } from "@elastic/elasticsearch";
import type { SearchClientLike } from "../elastic/search.js";
import { search } from "../elastic/search.js";
import { compileFilters, type QuerySpec } from "../elastic/query-builder.js";
import { totalHits, capLimit } from "./shared.js";
import { serviceNotFoundError, transactionNotFoundError } from "../utils/errors.js";

const DEFAULT_PERIOD = "1h";

function getAtPath(doc: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = doc;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Tolerant candidate-path cascade (design.md § 5): walks an ordered list of
 * dot-paths and returns the first one that resolves to a defined value on
 * `doc`. Used because `APM_ERROR_INDEX` field names are unverified against
 * this cluster's real mappings (Open Risk #1) — grouping must not hardcode
 * one field path.
 */
export function getFirstDefined(doc: unknown, candidatePaths: string[]): unknown {
  for (const path of candidatePaths) {
    const value = getAtPath(doc, path);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

interface GroupingResolution {
  value: unknown;
  pathUsed?: string;
}

/** Same cascade as `getFirstDefined`, but also reports which candidate path
 * resolved — needed for the `grouping_field_used` diagnostic field. */
function resolveGroupingKey(doc: unknown, candidatePaths: string[]): GroupingResolution {
  for (const path of candidatePaths) {
    const value = getAtPath(doc, path);
    if (value !== undefined) {
      return { value, pathUsed: path };
    }
  }
  return { value: undefined };
}

/** Candidate order per design.md § 5: `error.grouping_key` first, `error.exception.type` fallback. */
export const ERROR_GROUPING_CANDIDATES = ["error.grouping_key", "error.exception.type"];

interface GroupedError {
  key: string;
  count: number;
  service?: string;
  grouping_field_used?: string;
}

/**
 * Groups raw error documents client-side (ES cannot `terms`-aggregate on a
 * dynamically-resolved field), using the tolerant cascade above. Documents
 * that resolve neither candidate path are excluded from grouping rather than
 * grouped under a synthetic key, since there is nothing to group them by.
 */
function groupErrorDocs(docs: unknown[], limit: number): GroupedError[] {
  const groups = new Map<string, GroupedError>();
  for (const doc of docs) {
    const resolution = resolveGroupingKey(doc, ERROR_GROUPING_CANDIDATES);
    if (resolution.value === undefined) {
      continue;
    }
    const key = String(resolution.value);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        key,
        count: 1,
        service: getFirstDefined(doc, ["service.name"]) as string | undefined,
        grouping_field_used: resolution.pathUsed,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

interface StatusCodeBucket {
  key: string;
  doc_count: number;
}

interface RangeAggregationResponse {
  buckets?: StatusCodeBucket[];
}

interface TermsAggregationResponse {
  buckets?: StatusCodeBucket[];
}

/** Only the two ranges relevant to error analysis (unlike health.ts's full 2xx-5xx breakdown). */
const HTTP_ERROR_STATUS_RANGES = [
  { key: "4xx", from: 400, to: 500 },
  { key: "5xx", from: 500, to: 600 },
];

export interface GetServiceErrorsParams {
  service: string;
  environment?: string;
  period?: string;
}

export interface ServiceErrorsResult {
  service: string;
  period: string;
  requests: number;
  http_4xx: number;
  http_5xx: number;
  event_outcome: { success: number; failure: number; unknown: number };
  apm_errors: number;
}

/**
 * Service-level error analysis (FR-8). `http_4xx`, `http_5xx`,
 * `event_outcome`, and `apm_errors` are independent, unrelated fields — no
 * "is this a real failure" judgment is derived or added.
 */
export async function getServiceErrors(
  client: SearchClientLike,
  params: GetServiceErrorsParams,
  traceIndex: string,
  errorIndex: string,
): Promise<ServiceErrorsResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const traceSpec: QuerySpec = {
    service: params.service,
    environment: params.environment,
    processorEvent: "transaction",
    period,
  };
  const errorSpec: QuerySpec = {
    service: params.service,
    environment: params.environment,
    period,
  };

  const [traceResponse, errorResponse] = await Promise.all([
    search(client, {
      index: traceIndex,
      size: 0,
      query: { bool: { filter: compileFilters(traceSpec) } },
      aggs: {
        status_codes: { range: { field: "http.response.status_code", ranges: HTTP_ERROR_STATUS_RANGES } },
        event_outcome: { terms: { field: "event.outcome", size: 10 } },
      } as unknown as Record<string, estypes.AggregationsAggregationContainer>,
    }),
    search(client, {
      index: errorIndex,
      size: 0,
      query: { bool: { filter: compileFilters(errorSpec) } },
    }),
  ]);

  const requests = totalHits(traceResponse);
  if (requests === 0) {
    throw serviceNotFoundError(params.service);
  }

  const aggs = traceResponse.aggregations as unknown as
    | {
        status_codes?: RangeAggregationResponse;
        event_outcome?: TermsAggregationResponse;
      }
    | undefined;

  const statusBuckets = aggs?.status_codes?.buckets ?? [];
  const http_4xx = statusBuckets.find((b) => b.key === "4xx")?.doc_count ?? 0;
  const http_5xx = statusBuckets.find((b) => b.key === "5xx")?.doc_count ?? 0;

  const outcomeBuckets = aggs?.event_outcome?.buckets ?? [];
  const event_outcome = { success: 0, failure: 0, unknown: 0 };
  for (const bucket of outcomeBuckets) {
    if (bucket.key in event_outcome) {
      (event_outcome as Record<string, number>)[bucket.key] = bucket.doc_count;
    }
  }

  const apm_errors = totalHits(errorResponse);

  return {
    service: params.service,
    period,
    requests,
    http_4xx,
    http_5xx,
    event_outcome,
    apm_errors,
  };
}

export interface GetEndpointErrorsParams {
  service: string;
  transaction: string;
  environment?: string;
  period?: string;
}

export interface TopErrorEntry {
  key: string;
  count: number;
}

export interface EndpointErrorsResult {
  service: string;
  transaction: string;
  period: string;
  requests: number;
  failed_requests: number;
  error_rate: number;
  "4xx": number;
  "5xx": number;
  top_errors: TopErrorEntry[];
}

/** Internal bound on raw error docs scanned for endpoint-scoped grouping — never returned to callers. */
const ENDPOINT_ERROR_SCAN_CAP = 200;
const DEFAULT_ENDPOINT_TOP_ERRORS_LIMIT = 10;

/** Endpoint-level error analysis (FR-9). */
export async function getEndpointErrors(
  client: SearchClientLike,
  params: GetEndpointErrorsParams,
  traceIndex: string,
  errorIndex: string,
): Promise<EndpointErrorsResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const traceSpec: QuerySpec = {
    service: params.service,
    transactionName: params.transaction,
    environment: params.environment,
    processorEvent: "transaction",
    period,
  };
  const errorSpec: QuerySpec = {
    service: params.service,
    transactionName: params.transaction,
    environment: params.environment,
    period,
  };

  const [traceResponse, errorResponse] = await Promise.all([
    search(client, {
      index: traceIndex,
      size: 0,
      query: { bool: { filter: compileFilters(traceSpec) } },
      aggs: {
        status_codes: { range: { field: "http.response.status_code", ranges: HTTP_ERROR_STATUS_RANGES } },
      } as unknown as Record<string, estypes.AggregationsAggregationContainer>,
    }),
    search(client, {
      index: errorIndex,
      size: ENDPOINT_ERROR_SCAN_CAP,
      query: { bool: { filter: compileFilters(errorSpec) } },
    }),
  ]);

  const requests = totalHits(traceResponse);
  if (requests === 0) {
    throw transactionNotFoundError(params.service, params.transaction);
  }

  const aggs = traceResponse.aggregations as unknown as
    | { status_codes?: RangeAggregationResponse }
    | undefined;
  const statusBuckets = aggs?.status_codes?.buckets ?? [];
  const fourxx = statusBuckets.find((b) => b.key === "4xx")?.doc_count ?? 0;
  const fivexx = statusBuckets.find((b) => b.key === "5xx")?.doc_count ?? 0;
  const failed_requests = fourxx + fivexx;
  const error_rate = requests > 0 ? (failed_requests / requests) * 100 : 0;

  const errorHits = (errorResponse.hits?.hits ?? []) as { _source?: unknown }[];
  const errorDocsMatched = errorHits.map((hit) => hit._source);
  const top_errors = groupErrorDocs(errorDocsMatched, DEFAULT_ENDPOINT_TOP_ERRORS_LIMIT).map(
    ({ key, count }) => ({ key, count }),
  );

  return {
    service: params.service,
    transaction: params.transaction,
    period,
    requests,
    failed_requests,
    error_rate,
    "4xx": fourxx,
    "5xx": fivexx,
    top_errors,
  };
}

export interface GetTopErrorsParams {
  service?: string;
  environment?: string;
  period?: string;
  limit?: number;
}

export interface TopErrorsEntry {
  key: string;
  count: number;
  service?: string;
  grouping_field_used?: string;
}

export interface TopErrorsResult {
  period: string;
  errors: TopErrorsEntry[];
}

/** Internal bound on raw error docs scanned client-side for grouping — never returned to callers. */
const DOC_SCAN_CAP = 1000;
const DEFAULT_TOP_ERRORS_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Top errors, optionally scoped to a service (FR-10). Uses the tolerant
 * candidate-path cascade for grouping and reports which candidate path
 * resolved per group via `grouping_field_used` — a diagnostic aid given the
 * unverified `APM_ERROR_INDEX` mapping (Open Risk #1), not a field
 * consumers should rely on beyond transparency.
 */
export async function getTopErrors(
  client: SearchClientLike,
  params: GetTopErrorsParams,
  errorIndex: string,
): Promise<TopErrorsResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const limit = capLimit(params.limit, MAX_LIMIT, DEFAULT_TOP_ERRORS_LIMIT);

  const spec: QuerySpec = {
    service: params.service,
    environment: params.environment,
    period,
  };

  const response = await search(client, {
    index: errorIndex,
    size: DOC_SCAN_CAP,
    query: { bool: { filter: compileFilters(spec) } },
  });

  const hits = (response.hits?.hits ?? []) as { _source?: unknown }[];
  const docs = hits.map((hit) => hit._source);
  const errors = groupErrorDocs(docs, limit);

  return { period, errors };
}
