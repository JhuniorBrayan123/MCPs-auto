import type { SearchClientLike } from "../../src/elastic/search.js";

/**
 * A small, deliberately narrow in-memory Elasticsearch simulator used to
 * back `domain/*` tests with real fixture documents rather than
 * hand-computed aggregation responses. It supports exactly the request
 * shapes the domain layer issues: `term`/`bool.must_not` filters (the
 * `@timestamp` range clause is treated as always-satisfied — its own
 * correctness is already exhaustively covered by
 * `elastic/period-parser.test.ts` and `elastic/filters.test.ts`), and
 * `terms`/`percentiles`/`avg`/`max`/`value_count`/`filter`/`range`/`top_hits`
 * aggregations.
 *
 * This is test infrastructure only — never imported from `src/`.
 */

type Doc = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

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

function setAtPath(target: AnyRecord, path: string, value: unknown): void {
  const segments = path.split(".");
  let current: AnyRecord = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i] as string;
    if (typeof current[segment] !== "object" || current[segment] === null) {
      current[segment] = {};
    }
    current = current[segment] as AnyRecord;
  }
  const lastSegment = segments[segments.length - 1] as string;
  current[lastSegment] = value;
}

function matchesClause(doc: Doc, clause: AnyRecord): boolean {
  if (clause.term) {
    const [field, matcher] = Object.entries(clause.term)[0] as [string, unknown];
    const isMatcherObject = typeof matcher === "object" && matcher !== null;
    const expected = isMatcherObject ? (matcher as AnyRecord).value : matcher;
    const caseInsensitive = isMatcherObject && (matcher as AnyRecord).case_insensitive === true;
    const actual = getAtPath(doc, field);
    if (actual === undefined) {
      return false;
    }
    if (caseInsensitive) {
      return String(actual).toLowerCase() === String(expected).toLowerCase();
    }
    return actual === expected;
  }

  if (clause.range) {
    return true;
  }

  if (clause.bool?.must_not) {
    return !(clause.bool.must_not as AnyRecord[]).some((sub) => matchesClause(doc, sub));
  }

  return true;
}

function matchesQuery(doc: Doc, query: AnyRecord | undefined): boolean {
  if (!query?.bool?.filter) {
    return true;
  }
  return (query.bool.filter as AnyRecord[]).every((clause) => matchesClause(doc, clause));
}

function computePercentileValues(values: number[], percents: readonly number[]): Record<string, number | null> {
  const sorted = [...values].sort((a, b) => a - b);
  const result: Record<string, number | null> = {};
  for (const p of percents) {
    if (sorted.length === 0) {
      result[`${p}.0`] = null;
      continue;
    }
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    result[`${p}.0`] = sorted[idx] ?? null;
  }
  return result;
}

function numericValues(docs: Doc[], field: string): number[] {
  return docs
    .map((d) => getAtPath(d, field))
    .filter((v): v is number => typeof v === "number");
}

function runAgg(docs: Doc[], def: AnyRecord): AnyRecord {
  if (def.terms) {
    const field: string = def.terms.field;
    const size: number = def.terms.size ?? 10;
    const groups = new Map<string, Doc[]>();
    for (const doc of docs) {
      const key = getAtPath(doc, field);
      if (key === undefined) {
        continue;
      }
      const k = String(key);
      const existing = groups.get(k);
      if (existing) {
        existing.push(doc);
      } else {
        groups.set(k, [doc]);
      }
    }
    const buckets = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, size)
      .map(([key, groupDocs]) => {
        const bucket: AnyRecord = { key, doc_count: groupDocs.length };
        if (def.aggs) {
          for (const [subName, subDef] of Object.entries(def.aggs)) {
            bucket[subName] = runAgg(groupDocs, subDef as AnyRecord);
          }
        }
        return bucket;
      });
    return { buckets };
  }

  if (def.percentiles) {
    const values = numericValues(docs, def.percentiles.field);
    const percents: number[] = def.percentiles.percents;
    return { values: computePercentileValues(values, percents) };
  }

  if (def.avg) {
    const values = numericValues(docs, def.avg.field);
    const value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return { value };
  }

  if (def.max) {
    const values = numericValues(docs, def.max.field);
    const value = values.length > 0 ? Math.max(...values) : null;
    return { value };
  }

  if (def.value_count) {
    const values = docs
      .map((d) => getAtPath(d, def.value_count.field))
      .filter((v) => v !== undefined);
    return { value: values.length };
  }

  if (def.filter) {
    const filtered = docs.filter((d) => matchesClause(d, def.filter));
    const result: AnyRecord = { doc_count: filtered.length };
    if (def.aggs) {
      for (const [subName, subDef] of Object.entries(def.aggs)) {
        result[subName] = runAgg(filtered, subDef as AnyRecord);
      }
    }
    return result;
  }

  if (def.range) {
    const field: string = def.range.field;
    const ranges: AnyRecord[] = def.range.ranges;
    const buckets = ranges.map((r) => {
      const filtered = docs.filter((d) => {
        const v = getAtPath(d, field);
        if (typeof v !== "number") {
          return false;
        }
        if (r.from !== undefined && v < r.from) {
          return false;
        }
        if (r.to !== undefined && v >= r.to) {
          return false;
        }
        return true;
      });
      return { key: r.key, from: r.from, to: r.to, doc_count: filtered.length };
    });
    return { buckets };
  }

  if (def.top_hits) {
    const size: number = def.top_hits.size ?? 1;
    const sourceFields: string[] | undefined = def.top_hits._source;
    const selected = docs.slice(0, size).map((d) => {
      if (!sourceFields) {
        return { _source: d };
      }
      const source: AnyRecord = {};
      for (const path of sourceFields) {
        const value = getAtPath(d, path);
        if (value === undefined) {
          continue;
        }
        setAtPath(source, path, value);
      }
      return { _source: source };
    });
    return { hits: { hits: selected } };
  }

  return {};
}

/**
 * Builds a fake `SearchClientLike` backed by an in-memory array of fixture
 * documents. `.search()` filters the fixtures by the request's
 * `query.bool.filter` clauses and, when the request carries `aggs`, computes
 * them from the matched subset — the same shape a real Elasticsearch
 * response would carry.
 */
export function fakeSearchClientFromDocs(docs: Doc[]): SearchClientLike {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async search(request: any): Promise<any> {
      const matched = docs.filter((d) => matchesQuery(d, request.query));
      const hitsSize = request.size ?? 10;
      const hits = matched.slice(0, hitsSize).map((d) => ({ _source: d }));

      let aggregations: AnyRecord | undefined;
      if (request.aggs) {
        aggregations = {};
        for (const [name, def] of Object.entries(request.aggs)) {
          aggregations[name] = runAgg(matched, def as AnyRecord);
        }
      }

      return {
        hits: { total: { value: matched.length, relation: "eq" }, hits },
        aggregations,
      };
    },
  };
}

/**
 * Routes each request to a different fake client keyed by `request.index`,
 * so a single injected client can back domain functions that query two
 * separate indices (e.g. `APM_TRACE_INDEX` and `APM_ERROR_INDEX`) — the
 * same shape production code uses (one real `@elastic/elasticsearch`
 * client, two index names), instead of leaking a second client parameter
 * into the domain function signature.
 */
export function routedSearchClient(routes: Record<string, SearchClientLike>): SearchClientLike {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async search(request: any): Promise<any> {
      const target = routes[request.index as string];
      if (!target) {
        throw new Error(`fakeSearchClient: no route registered for index "${request.index}"`);
      }
      return target.search(request);
    },
  };
}
