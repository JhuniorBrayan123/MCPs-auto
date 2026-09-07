import type { estypes } from "@elastic/elasticsearch";
import type { SearchClientLike } from "../elastic/search.js";
import { search } from "../elastic/search.js";
import { compileFilters, type QuerySpec } from "../elastic/query-builder.js";
import { buildServiceNameAggregation } from "../elastic/aggregations.js";

const DEFAULT_PERIOD = "1h";
/** No `limit` parameter is exposed for `list_services` (specification.md);
 * bounded at the global response-bounding cap (FR-20) instead. */
const MAX_SERVICES = 100;

export interface ListServicesParams {
  environment?: string;
  period?: string;
}

export interface ServiceVolume {
  name: string;
  transactions: number;
}

export interface ListServicesResult {
  environment?: string;
  period: string;
  services: ServiceVolume[];
}

interface ServiceBucket {
  key: string;
  doc_count: number;
}

interface ServiceTermsAggregation {
  buckets: ServiceBucket[];
}

const AGG_NAME = "by_service";

/**
 * Discovers `service.name` values dynamically via aggregation (FR-1) — no
 * service name is ever hardcoded here, and no meaning is inferred from
 * name suffixes.
 */
export async function listServices(
  client: SearchClientLike,
  params: ListServicesParams,
  traceIndex: string,
): Promise<ListServicesResult> {
  const period = params.period ?? DEFAULT_PERIOD;
  const spec: QuerySpec = {
    environment: params.environment,
    processorEvent: "transaction",
    period,
  };

  const response = await search(client, {
    index: traceIndex,
    size: 0,
    query: { bool: { filter: compileFilters(spec) } },
    aggs: { [AGG_NAME]: buildServiceNameAggregation({ size: MAX_SERVICES }) } as unknown as Record<
      string,
      estypes.AggregationsAggregationContainer
    >,
  });

  const aggregation = (response.aggregations as unknown as Record<string, ServiceTermsAggregation>)?.[
    AGG_NAME
  ];
  const buckets = aggregation?.buckets ?? [];

  const services = buckets
    .map((bucket) => ({ name: bucket.key, transactions: bucket.doc_count }))
    .sort((a, b) => b.transactions - a.transactions);

  const result: ListServicesResult = { period, services };
  if (params.environment !== undefined) {
    result.environment = params.environment;
  }
  return result;
}
