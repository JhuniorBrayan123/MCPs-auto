# Tasks — elk-observability-mcp

Ordered, actionable checklist for a Strict-TDD implementer, top to bottom.
Each source-file task that has a natural test counterpart lists the test
task first (write the failing test, then the implementation to pass it).

Grouping note (Open Risk #7): given 13 tools plus a shared elastic/domain
layer, this checklist is deliberately sliced into review-sized units below.
Suggested commit/PR grouping is called out inline as `[commit: ...]`
markers in prose — these are groupings only, no PR-chaining tool or skill
is being invoked for this change since SDD skill ceremony is bypassed here.

## 0. Project scaffolding
`[commit: scaffolding]` — safe to bundle as one commit; no business logic yet.

- [x] Initialize `package.json` (Node.js + TypeScript, ESM), with
      dependencies: `@modelcontextprotocol/sdk`, `@elastic/elasticsearch`,
      `zod`; dev dependencies: `typescript`, `vitest`, `@types/node`.
- [x] Add `tsconfig.json` (strict mode enabled, ESM/Node16 module
      resolution, targeting a current LTS Node version).
- [x] Add `vitest.config.ts` (test root, coverage provider configured).
- [x] Add `.env.example` with the exact contents from `specification.md`
      (`ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`, `APM_TRACE_INDEX`,
      `APM_ERROR_INDEX`, `EXTRA_SENSITIVE_FIELDS`, `DEBUG`).
- [x] Write failing test for `config/env.ts`: throws/returns a typed error
      when `ELASTICSEARCH_URL` or `ELASTICSEARCH_API_KEY` is missing;
      applies documented defaults for `APM_TRACE_INDEX`/`APM_ERROR_INDEX`
      when unset; parses `EXTRA_SENSITIVE_FIELDS` into a string array;
      parses `DEBUG` into a boolean.
- [x] Implement `config/env.ts` to satisfy the above test.
- [x] Add `.gitignore` (`node_modules`, `dist`, `.env`, coverage output).

## 1. Elastic layer
`[commit: elastic-layer]` — one reviewable unit; this is the highest-risk
shared code (query correctness affects all 13 tools), so keep it isolated
from tool-level changes in review.

- [x] Write failing tests for `elastic/period-parser.ts`: accepts exactly
      `15m,30m,1h,2h,6h,12h,24h,7d`; rejects any other string including
      adversarial/injection-style input (`"1h; DROP"`, `"' OR 1=1"`,
      empty string, `null`-ish input) with `INVALID_PERIOD`.
- [x] Implement `elastic/period-parser.ts` to satisfy the above.
- [x] Write failing tests for `elastic/filters.ts`: one test per
      per-dimension filter function (`service.name`, `service.environment`,
      `processor.event`, `transaction.name`, `http.request.method`,
      `@timestamp` range, `trace.id`, OPTIONS-exclusion clause) — each
      asserting present-key -> clause emitted, absent-key -> no clause.
- [x] Implement `elastic/filters.ts` to satisfy the above.
- [x] Write failing tests for `elastic/query-builder.ts`
      (`compileFilters(spec: QuerySpec)`): composes the per-dimension
      filters correctly; explicit test "`spec` without `environment` key
      -> filter array contains zero environment clauses" (FR-14); explicit
      test "`spec.service` flows into a `term` filter with no
      transformation/classification" (FR-1).
- [x] Implement `elastic/query-builder.ts` (`QuerySpec` type +
      `compileFilters`) to satisfy the above.
- [x] Write failing tests for `elastic/aggregations.ts`: builder functions
      produce the expected `terms` + `percentiles`/`avg`/`max` sub-aggregation
      shapes for both `transaction.name`-keyed and `service.name`-keyed
      aggregations.
- [x] Implement `elastic/aggregations.ts` to satisfy the above.
- [x] Write failing tests for `elastic/client.ts`: constructs an
      `@elastic/elasticsearch` client using `ELASTICSEARCH_URL` and sends
      `Authorization: ApiKey <key>`; never logs the API key value.
- [x] Implement `elastic/client.ts` to satisfy the above.
- [x] Write failing tests for `elastic/search.ts` (error-mapped wrapper):
      maps ES client errors (401, 403, 404 index-not-found, timeout, other
      5xx/unknown) to the exact typed taxonomy codes from
      `specification.md`; asserts no raw stack trace is attached unless
      `DEBUG=true`.
- [x] Implement `elastic/search.ts` to satisfy the above.

## 2. Utils
`[commit: utils]` — small, can be bundled with the elastic-layer commit or
kept separate; grouped here for clarity of test-first sequencing.

- [x] Write failing tests for `utils/time.ts`: microsecond-to-millisecond
      conversion correctness (including fractional-microsecond edge cases
      from the sample docs, e.g. `457us -> 0.457ms`) and that every
      converted value is only ever placed under an explicitly `_ms`-suffixed
      key by convention used elsewhere (documented, tested at call sites
      later).
- [x] Implement `utils/time.ts` to satisfy the above.
- [x] Write failing tests for `utils/sanitize.ts`
      (`sanitizeDocument(doc, extraSensitiveFields?)`): strips
      `Authorization`/`Cookie`/`Set-Cookie` headers and request/response
      bodies/query strings by default; honors a configurable extra
      sensitive-field list; never mutates input in a way that could leak
      the original object by reference.
- [x] Implement `utils/sanitize.ts` to satisfy the above.
- [x] Write failing tests for `utils/errors.ts` (typed error taxonomy):
      one constructor/factory per code
      (`AUTHENTICATION_ERROR, AUTHORIZATION_ERROR, INDEX_NOT_FOUND,
      SERVICE_NOT_FOUND, TRANSACTION_NOT_FOUND, TRACE_NOT_FOUND,
      INVALID_PERIOD, ELASTICSEARCH_TIMEOUT, ELASTICSEARCH_ERROR`);
      serializes to the response envelope shape from `specification.md`.
- [x] Implement `utils/errors.ts` to satisfy the above.

## 3. Domain layer (per capability group, fixture-backed fake client)
`[commit: domain-services-endpoints]`, `[commit: domain-health-latency]`,
`[commit: domain-errors]`, `[commit: domain-traces]`,
`[commit: domain-compare]` — five separate reviewable units; each is
independently testable and each maps to a disjoint requirement group, so
splitting them keeps individual PRs small despite the 13-tool total.

- [x] Add `test/fixtures/*.json`: representative transaction doc (from the
      spec, including a verb-less `transaction.name` case and an
      `OPTIONS` case), representative span doc (mssql, plus at least one
      non-mssql subtype e.g. `http` or `redis` to avoid hardcoding),
      representative APM error doc (with only best-guess candidate fields
      per Open Risk #1), and a doc missing the `environment` field.
- [x] Write failing tests for `domain/services.ts`
      (`listServices`, `getSlowServices`) against the fake `SearchClient`
      and fixtures; assert no environment filter is applied when
      `environment` is omitted; assert OPTIONS exclusion default behavior.
- [x] Implement `domain/services.ts` to satisfy the above.
- [x] Write failing tests for `domain/endpoints.ts`
      (`listEndpoints`, `getSlowEndpoints`) — asserts grouping by
      `transaction.name` not `url.path`; asserts `method` comes from
      `http.request.method`, never parsed out of `transaction.name`.
- [x] Implement `domain/endpoints.ts` to satisfy the above.
- [x] Write failing tests for health/latency domain functions
      (`getServiceHealth`, `getEndpointHealth`, `getEndpointLatency`) —
      assert response shape matches `specification.md` exactly, including
      absence of any healthy/degraded/critical field.
- [x] Implement the health/latency functions (may live in `domain/services.ts`
      and `domain/endpoints.ts` alongside the discovery functions, or a
      dedicated `domain/health.ts` — implementer's choice, keep cohesive)
      to satisfy the above.
- [x] Write failing tests for `domain/errors.ts`
      (`getServiceErrors`, `getEndpointErrors`, `getTopErrors`) — assert
      4xx/5xx/`event.outcome`/APM-error counts are independent fields;
      assert `getTopErrors` uses the `getFirstDefined` candidate-path
      cascade (`error.grouping_key` then `error.exception.type`) and
      reports `grouping_field_used`.
- [x] Implement `utils`/helper `getFirstDefined(doc, candidatePaths)` plus
      `domain/errors.ts` to satisfy the above.
- [x] Write failing tests for `domain/traces.ts`
      (`traceRequest`, `getTraceDependencies`) — assert `TRACE_NOT_FOUND`
      when no docs match; assert chronological ordering; assert dependency
      grouping by `(span.type, span.subtype, destination.address)`; assert
      `percentage_of_trace` is never clamped and the `caveat` field is
      always present.
- [x] Implement `domain/traces.ts` to satisfy the above.
- [x] Write failing tests for `domain/compare.ts` (`comparePeriods`) —
      assert absolute + percentage diff computed correctly for each
      metric; assert `diff_percent` is `null` (not `Infinity`/`NaN`) when
      the comparison value is `0`.
- [x] Implement `domain/compare.ts` to satisfy the above.

## 4. Schemas (Zod, per tool)
`[commit: schemas]` — one commit; purely declarative, low risk, but still
test-first per the strict-TDD contract.

- [x] Write failing Zod boundary tests per tool: required vs. optional
      params, `period` validated against the parser, `limit <= 100`
      enforcement plus each tool's specific default, `percentile` enum
      constraints where applicable.
- [x] Implement `schemas/*.ts` (one file per tool, or one file per
      capability group — implementer's choice) to satisfy the above.

## 5. Tools (13 total, thin wiring)
`[commit: tools-discovery]` (list_services, list_endpoints),
`[commit: tools-health]` (get_service_health, get_endpoint_health,
get_endpoint_latency, get_slow_services, get_slow_endpoints),
`[commit: tools-errors]` (get_service_errors, get_endpoint_errors,
get_top_errors), `[commit: tools-traces]` (trace_request,
get_trace_dependencies), `[commit: tools-compare]` (compare_periods) — five
small PRs, each thin (zod validate -> domain call -> sanitize/shape
response), grouped by capability to mirror the domain-layer split above.

- [x] Implement `tools/list_services.ts`.
- [x] Implement `tools/list_endpoints.ts`.
- [x] Implement `tools/get_service_health.ts`.
- [x] Implement `tools/get_endpoint_health.ts`.
- [x] Implement `tools/get_endpoint_latency.ts`.
- [x] Implement `tools/get_slow_services.ts`.
- [x] Implement `tools/get_slow_endpoints.ts`.
- [x] Implement `tools/get_service_errors.ts`.
- [x] Implement `tools/get_endpoint_errors.ts`.
- [x] Implement `tools/get_top_errors.ts`.
- [x] Implement `tools/trace_request.ts`.
- [x] Implement `tools/get_trace_dependencies.ts`.
- [x] Implement `tools/compare_periods.ts`.
- [x] For each tool above: pass every document field returned to callers
      through `utils/sanitize.ts` before responding (no tool bypasses
      sanitization).

## 6. Server / transport
`[commit: server-transport]` — one commit; wires everything together, so
keep it last among the code commits and small (registration only, no new
business logic).

- [x] Write failing test(s) for `server/index.ts`: registers exactly the 13
      tools by name, no more, no fewer; each registration wires its zod
      input schema.
- [x] Implement `server/index.ts` to satisfy the above.
- [x] Implement `transport/stdio.ts` (stdio transport bootstrap, calling
      into `server/index.ts`) — no business logic here, only process
      wiring (stdin/stdout, signal handling, startup env validation via
      `config/env.ts`).
- [x] Add the executable entrypoint (e.g. `src/main.ts` or `bin` field)
      that starts the stdio transport.

## 7. Docker
`[commit: docker]` — one commit; can happen any time after scaffolding, but
sequenced here since it depends on knowing the final entrypoint.

- [x] Write `Dockerfile` (multi-stage: build stage compiles TypeScript,
      runtime stage installs production dependencies only, runs as a
      non-root user, `ENTRYPOINT` starts the stdio server).
- [x] Write `.dockerignore` (excludes `node_modules`, `test/`, `.env`,
      source maps/coverage output, `.git`).

## 8. README
`[commit: readme]` — one commit; documentation-only, can be reviewed fast
and independently of code commits.

- [x] Write `README.md` covering: architecture overview (layer diagram from
      `design.md`), configuration reference (all env vars), install/run
      instructions (local Node and Docker), Claude Code/Claude Desktop MCP
      client configuration snippet (stdio command), full tools reference
      (params + example request/response per tool, mirroring
      `specification.md`), security section (read-only guarantee,
      sanitization defaults, no API keys in logs, error taxonomy summary),
      Docker usage, and a troubleshooting section (common `INDEX_NOT_FOUND`
      / auth error causes, and the unverified-mapping risks from
      `requirements.md` Open Risks).

## 9. Integration tests
`[commit: integration-tests]` — separate from unit-test commits above;
these only run when real credentials are present and are the vehicle for
resolving Open Risks #1, #2, #6 once real ES access exists.

- [x] Write integration tests gated by
      `describe.skipIf(!process.env.ELASTICSEARCH_URL || !process.env.ELASTICSEARCH_API_KEY)`
      covering: successful authentication against the real cluster; a
      real aggregation request against `APM_TRACE_INDEX` returning a
      shape-sane response; a real `_mapping` inspection of
      `APM_ERROR_INDEX` (to confirm or correct the `error.grouping_key` /
      `error.exception.type` candidate order from `design.md` section 5);
      a real `INDEX_NOT_FOUND` response when pointed at a deliberately
      nonexistent index name. Implemented in
      `test/integration/elasticsearch.integration.test.ts`; verified as
      correctly SKIPPED (not failed, not silently absent) in this
      credential-less environment — never actually exercised against a
      live cluster, since no real `ELASTICSEARCH_URL`/`ELASTICSEARCH_API_KEY`
      exist here (Open Risks #1, #2).
- [x] Once real `_mapping` results are available, update
      `domain/errors.ts`'s candidate-path list if the assumed fields do
      not exist, and update `requirements.md` Open Risk #1 to reflect the
      confirmed (or corrected) field names. **Done (2026-08-26)**: real
      integration run against a live cluster confirmed both
      `error.grouping_key` and `error.exception.type` exist — no changes
      needed to `domain/errors.ts`'s candidate order.
- [x] Write `specs/elk-observability-mcp/verification.md` documenting
      final test/build/Docker status and FR-1..FR-24 traceability (this
      task, produced after implementation per `specs/README.md`).

## Sequencing / grouping summary

Recommended commit/PR order (smallest safe increments first):
1. scaffolding
2. elastic-layer (+ utils, may combine)
3. domain-services-endpoints
4. domain-health-latency
5. domain-errors
6. domain-traces
7. domain-compare
8. schemas
9. tools-discovery
10. tools-health
11. tools-errors
12. tools-traces
13. tools-compare
14. server-transport
15. docker
16. readme
17. integration-tests

This keeps every PR reviewable on its own (single capability group or
single layer), while preserving the strict-TDD requirement that each unit
of business logic has its failing test committed before its implementation.
No PR-chaining tool/skill is used to enforce this ordering — it is a plain
sequencing convention for whoever implements these tasks.
