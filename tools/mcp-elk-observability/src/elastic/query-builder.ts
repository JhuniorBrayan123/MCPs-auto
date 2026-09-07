import type { estypes } from "@elastic/elasticsearch";
import {
  serviceNameFilter,
  environmentFilter,
  processorEventFilter,
  transactionNameFilter,
  httpMethodFilter,
  timestampRangeFilter,
  traceIdFilter,
  optionsExclusionFilter,
} from "./filters.js";

/**
 * Declarative, plain-object query specification. Every field is optional;
 * a field's mere absence (not a default value) is the only way to express
 * "no filter for this dimension" (FR-14). `service` flows straight into a
 * `term` filter with zero transformation/classification (FR-1).
 */
export interface QuerySpec {
  service?: string;
  environment?: string;
  processorEvent?: "transaction" | "span";
  transactionName?: string;
  httpMethod?: string;
  includeOptions?: boolean;
  /** Pre-validated period expression (see elastic/period-parser.ts). */
  period?: string;
  traceId?: string;
}

/**
 * Composes the per-dimension filter functions from filters.ts into the
 * `bool.filter` clause array for a search request. Each filter function is
 * called with the full spec and independently decides, from its own key
 * only, whether to contribute a clause.
 */
export function compileFilters(spec: QuerySpec): estypes.QueryDslQueryContainer[] {
  const clauses = [
    serviceNameFilter(spec),
    environmentFilter(spec),
    processorEventFilter(spec),
    transactionNameFilter(spec),
    httpMethodFilter(spec),
    timestampRangeFilter(spec),
    traceIdFilter(spec),
    optionsExclusionFilter(spec),
  ];

  return clauses.filter(
    (clause): clause is estypes.QueryDslQueryContainer => clause !== undefined,
  );
}
