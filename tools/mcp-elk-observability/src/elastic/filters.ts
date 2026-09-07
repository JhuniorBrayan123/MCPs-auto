import type { estypes } from "@elastic/elasticsearch";
import { parsePeriod } from "./period-parser.js";

type QueryClause = estypes.QueryDslQueryContainer;

/**
 * Per-dimension filter functions. Each inspects only its own key on the
 * spec-like object passed in and returns either a single filter clause or
 * `undefined`. There is no shared state and no cross-key logic — this is
 * what makes "key absent -> no clause" structurally guaranteed rather than
 * something that has to be remembered by a caller (FR-14).
 */

export function serviceNameFilter(spec: { service?: string }): QueryClause | undefined {
  if (spec.service === undefined) {
    return undefined;
  }
  return { term: { "service.name": spec.service } };
}

export function environmentFilter(spec: { environment?: string }): QueryClause | undefined {
  if (spec.environment === undefined) {
    return undefined;
  }
  return { term: { "service.environment": spec.environment } };
}

export function processorEventFilter(spec: {
  processorEvent?: string;
}): QueryClause | undefined {
  if (spec.processorEvent === undefined) {
    return undefined;
  }
  return { term: { "processor.event": spec.processorEvent } };
}

export function transactionNameFilter(spec: {
  transactionName?: string;
}): QueryClause | undefined {
  if (spec.transactionName === undefined) {
    return undefined;
  }
  return { term: { "transaction.name": spec.transactionName } };
}

export function httpMethodFilter(spec: { httpMethod?: string }): QueryClause | undefined {
  if (spec.httpMethod === undefined) {
    return undefined;
  }
  return { term: { "http.request.method": spec.httpMethod } };
}

/**
 * Translates spec.period (already validated by period-parser) into an
 * `@timestamp` range clause of `[now-{period}, now]`. Absent period means
 * no time filter is applied.
 */
export function timestampRangeFilter(spec: { period?: string }): QueryClause | undefined {
  if (spec.period === undefined) {
    return undefined;
  }
  const gte = parsePeriod(spec.period);
  return { range: { "@timestamp": { gte, lte: "now" } } };
}

export function traceIdFilter(spec: { traceId?: string }): QueryClause | undefined {
  if (spec.traceId === undefined) {
    return undefined;
  }
  return { term: { "trace.id": spec.traceId } };
}

/**
 * OPTIONS-exclusion clause (FR-15). Defaults to excluding OPTIONS requests
 * (`includeOptions` absent or `false`); emits no clause only when the
 * caller explicitly opts in with `includeOptions: true`. Matching is
 * case-insensitive (Open Risk #6: OPTIONS casing on `http.request.method`
 * is unverified against real documents).
 */
export function optionsExclusionFilter(spec: {
  includeOptions?: boolean;
}): QueryClause | undefined {
  if (spec.includeOptions === true) {
    return undefined;
  }
  return {
    bool: {
      must_not: [
        {
          term: {
            "http.request.method": { value: "OPTIONS", case_insensitive: true },
          },
        },
      ],
    },
  };
}
