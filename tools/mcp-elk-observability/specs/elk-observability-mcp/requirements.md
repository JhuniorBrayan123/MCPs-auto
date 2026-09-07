# Requirements — elk-observability-mcp

## Problem / Context

AI agents need a safe, read-only way to query Elastic APM/Elasticsearch for
microservice observability data (traces, transactions, spans, errors) without
embedding any AI/LLM reasoning or health-classification logic inside the
query layer itself. This MCP server is purely an evidence/normalization
layer: it fetches, normalizes, and shapes Elasticsearch data into small,
deterministic, structured responses that a calling agent (or human) can
reason over. It never decides "healthy/degraded/critical" — it returns
objective metrics only.

Target environment: Elastic Cloud, Elasticsearch/APM version 8.19.20.
Consumers of this MCP: AI coding/ops agents connecting via MCP clients
(Claude Code, Claude Desktop, etc.) over stdio transport in v0.1.

## Functional Requirements

### FR-1 — Dynamic service discovery (`list_services`)
The system SHALL discover `service.name` values dynamically via aggregation
against `APM_TRACE_INDEX`. It SHALL NOT hardcode any service name anywhere
in source code, tests, defaults, or documentation examples beyond illustrative
comments. It SHALL NOT infer any meaning from service-name suffixes (e.g. it
must not classify services as "query", "command", or "backend" based on
naming conventions such as `Qry`/`Cmd`/`BE`).

- Input: `environment?` (string, free-form), `period?` (string, validated
  period expression, default `1h`).
- Output: environment (if provided), period, and a list of
  `{ name: string, transactions: number }` sorted by transaction volume
  descending.

### FR-2 — Endpoint discovery (`list_endpoints`)
The system SHALL group transactions by `transaction.name` (never by
`url.path`) as the primary grouping key, because `transaction.name` is
already parameter-normalized by the APM agent.

- Input: `service` (required), `environment?`, `period?` (default `1h`),
  `limit?` (default 20, max 100), `include_options?` (default `false`).
- Output: `{ service, endpoints: [{ transaction, method, sample_path,
  requests }] }`, where `method` is read from `http.request.method` (not
  parsed from `transaction.name`) and `sample_path` is a representative
  `url.path` value from a matching document.
- The system SHALL NOT assume `transaction.name` starts with an HTTP verb —
  verb-less transaction names (e.g. `ProcesarDescargoFacturacionV2`) are
  valid and must be handled without error.
- When `include_options` is `false` (default), transactions whose
  `http.request.method` is `OPTIONS` (case-insensitive) SHALL be excluded.

### FR-3 — Service health (`get_service_health`)
- Input: `service` (required), `environment?`, `period?` (default `1h`),
  `include_options?` (default `false`).
- Output: `requests`, `throughput_rpm`, `latency: {avg_ms, p50_ms, p95_ms,
  p99_ms, max_ms}`, `errors: {count, rate_percent}`, `status_codes: {2xx,
  3xx, 4xx, 5xx}`.
- The system SHALL NOT emit any healthy/degraded/critical classification or
  any other derived judgment — only objective, measured values.

### FR-4 — Endpoint health (`get_endpoint_health`)
Same response shape as FR-3, additionally filtered by `transaction` (i.e.
`transaction.name`).
- Input: `service` (required), `transaction` (required), `environment?`,
  `period?` (default `1h`), `include_options?` (default `false`).

### FR-5 — Endpoint latency (`get_endpoint_latency`)
- Input: `service` (required), `transaction` (required), `environment?`,
  `period?` (default `1h`).
- Output: `avg_ms, p50_ms, p75_ms, p90_ms, p95_ms, p99_ms, max_ms, requests`.

### FR-6 — Slow services ranking (`get_slow_services`)
- Input: `environment?`, `period?` (default `1h`), `limit?` (default 10, max
  100), `percentile?` (default 95, one of the supported percentile values).
- Output: services ordered descending by the selected latency percentile.
- OPTIONS requests SHALL be excluded by default (no override parameter is
  exposed for this service-level ranking tool — exclusion is unconditional
  here since it operates across all endpoints of a service).

### FR-7 — Slow endpoints ranking (`get_slow_endpoints`)
- Input: `service` (required), `environment?`, `period?` (default `1h`),
  `limit?` (default 10, max 100), `percentile?` (default 95),
  `include_options?` (default `false`).
- Output: `{ service, period, percentile, endpoints: [{ transaction,
  requests, avg_ms, p95_ms, p99_ms }] }` ordered descending by the selected
  percentile.

### FR-8 — Service error analysis (`get_service_errors`)
- Input: `service` (required), `environment?`, `period?` (default `1h`).
- Output SHALL present HTTP 4xx counts, HTTP 5xx counts, `event.outcome`
  breakdown, and APM error-index counts as distinct, separate fields. The
  system SHALL NOT assume or encode that all 4xx responses represent system
  failures — they are reported as raw evidence only.

### FR-9 — Endpoint error analysis (`get_endpoint_errors`)
- Input: `service` (required), `transaction` (required), `environment?`,
  `period?` (default `1h`).
- Output: `requests, failed_requests, error_rate, 4xx, 5xx, top_errors`.

### FR-10 — Top errors (`get_top_errors`)
- Input: `service?`, `environment?`, `period?` (default `1h`), `limit?`
  (default 10, max 100).
- Uses `APM_ERROR_INDEX` (configurable, default `logs-apm.error-default`).
- The system SHALL group errors using a tolerant, candidate-path cascade
  strategy rather than assuming one fixed field path, because the exact
  field names available in this cluster's error index are unverified (see
  Open Risk #1).

### FR-11 — Trace reconstruction (`trace_request`)
- Input: `trace_id` (required).
- The system SHALL fetch all documents where `trace.id` equals the given
  value from `APM_TRACE_INDEX`, split them by `processor.event` into the
  transaction document and span documents, and return them chronologically
  ordered in an AI-friendly shape: `{ trace_id, transaction: { service,
  name, duration_ms, status_code }, spans: [{ type, subtype, name,
  duration_ms, destination, database }] }`.
- If no documents are found for the given `trace_id`, the system SHALL
  return a `TRACE_NOT_FOUND` error rather than an empty success payload.

### FR-12 — Trace dependency breakdown (`get_trace_dependencies`)
- Input: `trace_id` (required).
- The system SHALL group spans by `(span.type, span.subtype,
  destination.address)` without hardcoding any specific dependency type
  (must support db/mssql, http, redis, kafka, external, and any other
  observed type/subtype uniformly).
- Output: `{ trace_duration_ms, dependencies: [{ type, subtype, destination,
  database, calls, total_duration_ms, percentage_of_trace }] }`.
- The system SHALL document, and SHALL NOT silently clamp, the fact that
  `percentage_of_trace` can exceed 100% when spans overlap concurrently
  (summed span duration is not bounded by wall-clock trace duration).

### FR-13 — Period comparison (`compare_periods`)
- Input: `service` (required), `transaction?`, `environment?`,
  `current_period` (required), `comparison_period` (required).
- Output SHALL compare `requests`, `throughput`, `avg_ms`, `p95_ms`,
  `p99_ms`, and error rate between the two periods, reporting both absolute
  and percentage difference for each metric.

### FR-14 — Environment optionality (cross-cutting)
`service.environment` is free-form and optional (observed values include
`produccion`, `dev`, `crt`, `qa`, but the set is not closed). When a caller
omits `environment`, the system SHALL NOT add any environment filter to the
underlying query — it SHALL NOT default to `"produccion"` or any other
value. Omitting the key from the internal query specification must be
structurally the only way to represent "no filter" (see design.md
`QuerySpec` decision).

### FR-15 — OPTIONS exclusion (cross-cutting)
Tools that expose `include_options?` SHALL default it to `false` and, when
`false`, SHALL exclude documents whose `http.request.method` is `OPTIONS`
(case-insensitive) from performance/ranking calculations.

### FR-16 — Time normalization (cross-cutting)
All duration values read from Elasticsearch (`transaction.duration.us`,
`span.duration.us`, stored in microseconds) SHALL be converted to
milliseconds before being returned, and SHALL always be exposed under
explicitly labeled fields (`avg_ms`, `p50_ms`, `p95_ms`, `p99_ms`, `max_ms`,
`duration_ms`, etc.) — never as an unlabeled/ambiguous numeric field.

### FR-17 — Period parsing (cross-cutting)
The system SHALL provide a single, reusable, strictly-validated period
parser accepting exactly the values `15m, 30m, 1h, 2h, 6h, 12h, 24h, 7d`,
translating them into an Elasticsearch `@timestamp` range filter using
`now-{period}`. Any other input SHALL be rejected with an `INVALID_PERIOD`
error before it can reach the query layer, to prevent injection into the
range filter.

### FR-18 — Read-only enforcement (cross-cutting)
No tool, and no code path reachable from any tool, SHALL ever issue a
write, update, delete, mapping-change, ILM, or cluster-settings request
against Elasticsearch. The Elasticsearch client SHALL be used exclusively
for `search`/read APIs.

### FR-19 — Privacy and sanitization (cross-cutting)
The system SHALL default to withholding potentially sensitive document
content — including `Authorization`, `Cookie`, `Set-Cookie` headers, full
request/response bodies, and query strings — from all responses. A
centralized `sanitizeDocument()` layer SHALL be the single enforcement
point, and SHALL support a configurable additional sensitive-field list.
API keys SHALL never be logged or returned under any circumstance,
including in debug/error output.

### FR-20 — Response bounding (cross-cutting)
All list-shaped responses SHALL enforce an upper bound of `limit <= 100`,
with tool-specific lower defaults (e.g. 10, 20, 50) chosen per tool.
Responses SHALL be small, structured, and deterministic — designed for
consumption by other LLMs/agents, not for humans browsing raw Elasticsearch
hits.

### FR-21 — Typed error taxonomy (cross-cutting)
All error conditions SHALL be mapped to exactly one of the following typed
codes: `AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`, `INDEX_NOT_FOUND`,
`SERVICE_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `TRACE_NOT_FOUND`,
`INVALID_PERIOD`, `ELASTICSEARCH_TIMEOUT`, `ELASTICSEARCH_ERROR`. Raw stack
traces SHALL NOT be returned to the client outside an explicit debug mode.

### FR-22 — No AI/LLM logic boundary (cross-cutting)
The system SHALL contain no AI/LLM calls, prompts, or model inference of
any kind, and SHALL NOT implement any classification, scoring, or judgment
logic that goes beyond deterministic arithmetic/aggregation over
Elasticsearch data (e.g. it must never label something "healthy" or
"anomalous" — that is the calling agent's responsibility, not this
server's).

### FR-23 — Transport layering (cross-cutting)
The system SHALL implement v0.1 using stdio transport only, but SHALL
structure code so that transport, MCP tool registration/server bootstrap,
domain/business-query logic, and the Elasticsearch client layer are
separated, such that an HTTP/SSE transport could be added later without
modifying business logic.

### FR-24 — Configuration via environment variables
Elasticsearch connection (`ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`) and
index names (`APM_TRACE_INDEX`, default `traces-apm-default`;
`APM_ERROR_INDEX`, default `logs-apm.error-default`) SHALL be supplied
exclusively via environment variables, validated at startup, and never
hardcoded. The API key SHALL be sent as the `Authorization: ApiKey
<API_KEY>` header.

## Non-Goals

- No SQL Server MCP functionality (no database schema introspection, no
  query execution against application databases).
- No Git/GitLab MCP functionality (no repository, issue, or merge-request
  operations).
- No BookStack (or any other documentation-platform) integration.
- No agent orchestration, multi-agent coordination, or skill invocation
  from within the MCP server itself.
- No diagnosis, alerting, remediation, or automated incident response of
  any kind.
- No writes of any kind to Elasticsearch — this server is strictly
  read-only for its entire lifetime in this scope, not just v0.1.
- No metrics data-stream tools in v0.1 (`metrics-apm.*` data streams are
  documented only as future extension points, not implemented).
- No UI/dashboard — this is an MCP server consumed by AI agents/clients,
  not an end-user application.

## Open Risks / Assumptions

1. **RESOLVED (2026-08-26).** `APM_ERROR_INDEX` field names were confirmed
   against a real Elasticsearch `_mapping` inspection via
   `test/integration/elasticsearch.integration.test.ts`: both
   `error.grouping_key` and `error.exception.type` exist in the real
   cluster's mapping. The assumed candidate-path cascade in
   `domain/errors.ts` (`ERROR_GROUPING_CANDIDATES`) required no changes.
2. **RESOLVED (2026-08-26).** A live `ELASTICSEARCH_URL`/`ELASTICSEARCH_API_KEY`
   was supplied and the full integration suite (6/6 tests: auth round-trip,
   real aggregation shape sanity, real `_mapping` inspection, real
   `INDEX_NOT_FOUND` behavior) ran and passed against the real cluster.
3. **Percentile results are TDigest approximations, not exact values** —
   Elasticsearch's `percentiles` aggregation is inherently approximate; this
   must be disclosed to consumers, not treated as a defect to "fix."
4. **The sample span document lacks `parent.id`/`span.id` fields.** Deep
   nested call-tree reconstruction beyond simple transaction/span grouping is
   unverified as possible and is not assumed to work; `trace_request` and
   `get_trace_dependencies` operate at the transaction/span-group level only.
5. **`percentage_of_trace` can exceed 100%** when spans overlap concurrently,
   because summed span duration is not bounded by trace wall-clock duration.
   This must ship as a documented caveat, never silently clamped to 100%.
6. **`http.request.method` casing for `OPTIONS`** (`OPTIONS` vs `options`) is
   assumed uppercase per HTTP convention but not verified against real
   documents; matching SHALL be case-insensitive to hedge this risk.
7. **Implementation sequencing risk:** given 13 tools plus a shared
   elastic/domain layer, a single implementation change is too large to
   review as one unit. Implementation is expected to be split into multiple
   reviewable commits/PRs (elastic+utils layer first, then per-tool-group
   slices) — this is flagged as a sequencing note in tasks.md, not resolved
   by any specific PR-chaining tool, since SDD skill ceremony is being
   bypassed for this change.
