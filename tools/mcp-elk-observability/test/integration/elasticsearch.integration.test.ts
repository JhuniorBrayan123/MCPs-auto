import { describe, expect, it, beforeAll } from "vitest";
import type { Client, estypes } from "@elastic/elasticsearch";
import { loadEnv, type EnvConfig } from "../../src/config/env.js";
import { createElasticsearchClient } from "../../src/elastic/client.js";
import { search, mapSearchError } from "../../src/elastic/search.js";
import { compileFilters, type QuerySpec } from "../../src/elastic/query-builder.js";
import { buildTransactionNameAggregation } from "../../src/elastic/aggregations.js";
import { ERROR_GROUPING_CANDIDATES } from "../../src/domain/errors.js";

/**
 * Real-cluster integration tests (tasks.md § 9, design.md § 7).
 *
 * These are gated with `describe.skipIf` on the presence of both
 * `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY`. In this project there
 * have never been real Elasticsearch credentials available (Open Risks #1
 * and #2 in requirements.md) — so this file is expected to be reported as
 * SKIPPED by every `npm test` run in this environment. It exists so that
 * the moment real credentials are supplied (locally or in CI), these tests
 * run automatically without any code change, and specifically so the
 * `_mapping` inspection below can finally confirm or correct the
 * `error.grouping_key` / `error.exception.type` candidate order documented
 * in design.md § 5 (Open Risk #1).
 *
 * Nothing in this file is mocked or faked — every request goes through the
 * real `@elastic/elasticsearch` client and the real `elastic/search.ts`
 * error-mapping wrapper, against the actual configured cluster.
 */
const hasRealCredentials = Boolean(
  process.env.ELASTICSEARCH_URL && process.env.ELASTICSEARCH_API_KEY,
);

describe.skipIf(!hasRealCredentials)("Elasticsearch integration (real cluster)", () => {
  // `loadEnv()`/client construction is deferred to `beforeAll` rather than
  // run at describe-body scope: vitest still *evaluates* a skipped
  // `describe` callback during test collection (only the `it` bodies and
  // hooks are skipped), so calling `loadEnv()` directly here would throw
  // `EnvValidationError` and fail the whole file even when credentials are
  // absent and this suite is meant to be skipped.
  let env: EnvConfig;
  let client: Client;

  beforeAll(() => {
    env = loadEnv();
    client = createElasticsearchClient({
      elasticsearchUrl: env.elasticsearchUrl,
      elasticsearchApiKey: env.elasticsearchApiKey,
    });
  });

  describe("authentication round-trip", () => {
    it("authenticates successfully and the cluster answers cluster info", async () => {
      const info = await client.info();
      expect(info).toBeDefined();
      expect(typeof info.cluster_name).toBe("string");
    });

    it("performs a real search against APM_TRACE_INDEX without an auth error", async () => {
      const spec: QuerySpec = { period: "1h" };
      const response = await search(client, {
        index: env.apmTraceIndex,
        size: 0,
        query: { bool: { filter: compileFilters(spec) } },
      });
      expect(response).toBeDefined();
      expect(response.hits).toBeDefined();
    });
  });

  describe("real aggregation response-shape sanity (APM_TRACE_INDEX)", () => {
    it("returns a terms + percentiles/avg/max aggregation shape for transaction.name", async () => {
      const spec: QuerySpec = { period: "24h", processorEvent: "transaction" };
      const agg = buildTransactionNameAggregation({ size: 20 });

      const response = await search<unknown>(client, {
        index: env.apmTraceIndex,
        size: 0,
        query: { bool: { filter: compileFilters(spec) } },
        aggs: {
          by_transaction: agg,
        } as unknown as Record<string, estypes.AggregationsAggregationContainer>,
      });

      expect(response.aggregations).toBeDefined();
      const byTransaction = (response.aggregations as Record<string, unknown>)?.by_transaction as
        | { buckets?: unknown[] }
        | undefined;
      expect(byTransaction).toBeDefined();
      expect(Array.isArray(byTransaction?.buckets)).toBe(true);

      const firstBucket = byTransaction?.buckets?.[0] as
        | {
            key: string;
            doc_count: number;
            latency_percentiles?: { values?: Record<string, number | null> };
            latency_avg?: { value: number | null };
            latency_max?: { value: number | null };
          }
        | undefined;

      // The bucket shape itself must be sane whether or not the period window
      // happened to contain any documents at the time this runs.
      if (firstBucket) {
        expect(typeof firstBucket.key).toBe("string");
        expect(typeof firstBucket.doc_count).toBe("number");
        expect(firstBucket.latency_percentiles?.values).toBeDefined();
        expect(firstBucket.latency_avg).toHaveProperty("value");
        expect(firstBucket.latency_max).toHaveProperty("value");
      }
    });
  });

  describe("real _mapping inspection (APM_ERROR_INDEX) — Open Risk #1", () => {
    it("fetches the real mapping and reports which error-grouping candidate paths actually exist", async () => {
      const mappingResponse = await client.indices.getMapping({ index: env.apmErrorIndex });
      expect(mappingResponse).toBeDefined();

      // getMapping keys the response by concrete backing index name, so walk
      // whatever indices/data streams matched `env.apmErrorIndex`.
      const indices = Object.values(mappingResponse) as Array<{
        mappings?: { properties?: Record<string, unknown> };
      }>;
      expect(indices.length).toBeGreaterThan(0);

      function hasPath(properties: Record<string, unknown> | undefined, path: string): boolean {
        const segments = path.split(".");
        let current: unknown = properties;
        for (const segment of segments) {
          if (typeof current !== "object" || current === null) {
            return false;
          }
          const node = (current as Record<string, unknown>)[segment];
          if (node === undefined) {
            return false;
          }
          // Elasticsearch mapping nodes nest object fields under `.properties`.
          current = (node as { properties?: unknown }).properties ?? node;
        }
        return true;
      }

      const foundCandidates = ERROR_GROUPING_CANDIDATES.filter((candidate) =>
        indices.some((idx) => hasPath(idx.mappings?.properties, candidate)),
      );

      // This is a diagnostic, not a hard requirement: design.md § 5 explicitly
      // treats the candidate order as a best-effort default pending this exact
      // check. We surface the result so a human/CI log can act on it (per
      // tasks.md's follow-up task to update domain/errors.ts's candidate list
      // and requirements.md Open Risk #1 if the assumed fields don't exist).
      // eslint-disable-next-line no-console
      console.info(
        `[integration] APM_ERROR_INDEX candidate paths confirmed present: ${
          foundCandidates.length > 0 ? foundCandidates.join(", ") : "(none of the assumed candidates were found)"
        }`,
      );

      // The only hard assertion: the mapping call itself must succeed and
      // return a well-formed properties object we were able to walk above.
      expect(indices.every((idx) => typeof idx.mappings === "object")).toBe(true);
    });
  });

  describe("real INDEX_NOT_FOUND behavior", () => {
    it("maps a deliberately nonexistent index to INDEX_NOT_FOUND", async () => {
      const nonexistentIndex = `mcp-elk-observability-integration-test-does-not-exist-${Date.now()}`;

      await expect(
        search(client, {
          index: nonexistentIndex,
          size: 0,
          query: { match_all: {} },
        }),
      ).rejects.toMatchObject({ code: "INDEX_NOT_FOUND" });
    });

    it("mapSearchError also classifies the raw thrown error as INDEX_NOT_FOUND", async () => {
      const nonexistentIndex = `mcp-elk-observability-integration-test-does-not-exist-${Date.now()}`;
      try {
        await client.search({
          index: nonexistentIndex,
          size: 0,
          query: { match_all: {} },
        });
        throw new Error("expected the real client to reject for a nonexistent index");
      } catch (err) {
        const mapped = mapSearchError(err);
        expect(mapped.code).toBe("INDEX_NOT_FOUND");
      }
    });
  });
});
